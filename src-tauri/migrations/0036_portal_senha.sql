-- Portal do Cliente: entrada com CPF/CNPJ + senha definida pelo operador.
--
-- A senha é de cada contato (não do CNPJ): é ela que diz QUEM entrou, se pode decidir orçamento
-- e a quem a resposta é atribuída. Só o hash bcrypt (pgcrypto) é gravado. O login por código
-- (0035) continua disponível. No Supabase o pgcrypto já existe no schema `extensions`.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE cliente_contatos
    ADD COLUMN IF NOT EXISTS portal_senha_hash TEXT,
    ADD COLUMN IF NOT EXISTS portal_senha_definida_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS portal_senha_definida_por_profile_id INTEGER
        REFERENCES security_profiles(id) ON DELETE SET NULL;

ALTER TABLE portal_sessoes
    ADD COLUMN IF NOT EXISTS metodo TEXT NOT NULL DEFAULT 'CODIGO';
DO $$ BEGIN
    ALTER TABLE portal_sessoes ADD CONSTRAINT chk_portal_sessoes_metodo CHECK (metodo IN ('CODIGO', 'SENHA'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sem acesso não há senha; trocar a senha encerra as sessões abertas com a anterior.
CREATE OR REPLACE FUNCTION autoos_portal_revisar_acesso_contato()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.portal_acesso <> 'NENHUM'
       AND (NEW.telefone IS DISTINCT FROM OLD.telefone
            OR NEW.email IS DISTINCT FROM OLD.email
            OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
            OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
            OR NOT NEW.ativo) THEN
        NEW.portal_acesso := 'NENHUM';
    END IF;
    IF NEW.portal_acesso = 'NENHUM' THEN
        NEW.portal_senha_hash := NULL;
        NEW.portal_senha_definida_em := NULL;
        NEW.portal_senha_definida_por_profile_id := NULL;
    END IF;
    IF NEW.portal_acesso IS DISTINCT FROM OLD.portal_acesso
       OR NEW.portal_senha_hash IS DISTINCT FROM OLD.portal_senha_hash THEN
        UPDATE public.portal_sessoes
        SET encerrada_em = statement_timestamp(), encerrada_motivo = 'ACESSO_ALTERADO'
        WHERE contato_id = NEW.id AND encerrada_em IS NULL;
        UPDATE public.portal_codigos
        SET invalidado_em = statement_timestamp()
        WHERE contato_id = NEW.id AND usado_em IS NULL AND invalidado_em IS NULL;
    END IF;
    RETURN NEW;
END;
$$;

-- Regra mínima para senha digitada pelo operador: 8 a 72 caracteres (limite do bcrypt),
-- com letra e número.
CREATE OR REPLACE FUNCTION public.autoos_portal_senha_valida(p_senha TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
    SELECT p_senha IS NOT NULL
       AND char_length(p_senha) >= 8
       AND octet_length(p_senha) <= 72
       AND p_senha ~ '[[:alpha:]]'
       AND p_senha ~ '[0-9]'
       AND p_senha !~ '[[:cntrl:]]'
$$;

-- Usada só pelo desktop (o comando Rust confere permissão e empresa antes).
-- Duas senhas iguais no mesmo cliente tornariam o login ambíguo: é recusado.
CREATE OR REPLACE FUNCTION public.portal_definir_senha_contato(
    p_empresa_id INTEGER,
    p_contato_id INTEGER,
    p_senha TEXT,
    p_profile_id INTEGER
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_c RECORD;
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    SELECT * INTO v_c FROM public.cliente_contatos
    WHERE id = p_contato_id AND empresa_id = p_empresa_id AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'CONTATO_INDISPONIVEL';
    END IF;

    IF p_senha IS NULL THEN
        UPDATE public.cliente_contatos
        SET portal_senha_hash = NULL, portal_senha_definida_em = NULL,
            portal_senha_definida_por_profile_id = NULL, atualizado_em = NOW()
        WHERE id = v_c.id;
        RETURN NULL;
    END IF;

    IF v_c.portal_acesso = 'NENHUM' THEN
        RAISE EXCEPTION 'CONTATO_SEM_ACESSO';
    END IF;
    IF NOT public.autoos_portal_senha_valida(p_senha) THEN
        RAISE EXCEPTION 'SENHA_FRACA';
    END IF;
    -- Todos os contatos do mesmo CPF/CNPJ (inclusive cadastros em outras empresas).
    PERFORM 1
    FROM public.cliente_contatos o
    JOIN public.clientes cl ON cl.id = o.cliente_id AND cl.empresa_id = o.empresa_id
    JOIN public.clientes meu ON meu.id = v_c.cliente_id
    WHERE o.id <> v_c.id AND o.ativo AND o.portal_senha_hash IS NOT NULL
      AND COALESCE(cl.ativo, TRUE)
      AND (cl.id = meu.id
           OR (length(public.autoos_portal_digitos(COALESCE(meu.documento, meu.cpf_cnpj))) IN (11, 14)
               AND public.autoos_portal_digitos(COALESCE(cl.documento, cl.cpf_cnpj))
                   = public.autoos_portal_digitos(COALESCE(meu.documento, meu.cpf_cnpj))))
      AND crypt(p_senha, o.portal_senha_hash) = o.portal_senha_hash;
    IF FOUND THEN
        RAISE EXCEPTION 'SENHA_REPETIDA';
    END IF;

    UPDATE public.cliente_contatos
    SET portal_senha_hash = crypt(p_senha, gen_salt('bf', 10)),
        portal_senha_definida_em = v_agora,
        portal_senha_definida_por_profile_id = p_profile_id,
        atualizado_em = NOW()
    WHERE id = v_c.id;
    RETURN v_agora;
END;
$$;

-- Entrada com CPF/CNPJ + senha. Resultado igual para documento inexistente e senha errada.
CREATE OR REPLACE FUNCTION public.portal_entrar_senha(
    p_documento TEXT,
    p_senha TEXT,
    p_nova_sessao_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_config RECORD;
    v_doc TEXT := public.autoos_portal_digitos(p_documento);
    v_c RECORD;
    v_achado RECORD;
    v_achados INTEGER := 0;
    v_candidatos INTEGER := 0;
    v_expira TIMESTAMPTZ;
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    SELECT * INTO v_config FROM public.portal_cliente_config WHERE singleton = TRUE;
    IF NOT COALESCE(v_config.portal_enabled, FALSE) THEN
        RAISE EXCEPTION 'PORTAL_PAUSADO';
    END IF;
    IF p_nova_sessao_hash IS NULL OR p_nova_sessao_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
    IF length(v_doc) NOT IN (11, 14) OR p_senha IS NULL OR octet_length(p_senha) > 72 THEN
        RETURN jsonb_build_object('resultado', 'INVALIDO');
    END IF;

    FOR v_c IN
        SELECT c.id, c.empresa_id, c.cliente_id, c.nome, c.portal_acesso, c.portal_senha_hash
        FROM public.clientes cl
        JOIN public.cliente_contatos c ON c.cliente_id = cl.id AND c.empresa_id = cl.empresa_id
        WHERE COALESCE(cl.ativo, TRUE) AND cl.empresa_id IS NOT NULL
          AND (public.autoos_portal_digitos(cl.documento) = v_doc OR public.autoos_portal_digitos(cl.cpf_cnpj) = v_doc)
          AND c.ativo AND c.portal_acesso <> 'NENHUM' AND c.portal_senha_hash IS NOT NULL
    LOOP
        v_candidatos := v_candidatos + 1;
        IF crypt(p_senha, v_c.portal_senha_hash) = v_c.portal_senha_hash THEN
            v_achados := v_achados + 1;
            v_achado := v_c;
        END IF;
    END LOOP;
    -- Mesmo custo de bcrypt quando o documento não tem senha cadastrada.
    IF v_candidatos = 0 THEN
        PERFORM crypt(p_senha, '$2a$10$Sp6ULFbzsJ7.LiOcTg5M1uMGnl3N8Lxhivn6tUB.I9uJ0NymrU8Sy');
    END IF;
    IF v_achados <> 1 THEN
        RETURN jsonb_build_object('resultado', 'INVALIDO');
    END IF;

    INSERT INTO public.portal_sessoes
        (token_hash, empresa_id, cliente_id, contato_id, expira_em, verificada_em, ultimo_acesso_em, metodo)
    VALUES
        (p_nova_sessao_hash, v_achado.empresa_id, v_achado.cliente_id, v_achado.id,
         v_agora + make_interval(hours => v_config.sessao_horas), v_agora, v_agora, 'SENHA')
    RETURNING expira_em INTO v_expira;

    RETURN jsonb_build_object(
        'resultado', 'OK',
        'contato', v_achado.nome,
        'acesso', v_achado.portal_acesso,
        'expiraEm', v_expira,
        'metodo', 'SENHA'
    );
END;
$$;

-- Reconfirma a senha da própria sessão antes de aceitar/recusar (verificação recente).
CREATE OR REPLACE FUNCTION public.portal_reverificar_senha(p_sessao_hash TEXT, p_senha TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_s RECORD;
    v_hash TEXT;
BEGIN
    SELECT * INTO v_s FROM public.autoos_portal_sessao(p_sessao_hash);
    SELECT portal_senha_hash INTO v_hash FROM public.cliente_contatos WHERE id = v_s.s_contato_id;
    IF v_hash IS NULL OR p_senha IS NULL OR octet_length(p_senha) > 72
       OR crypt(p_senha, v_hash) <> v_hash THEN
        RETURN FALSE;
    END IF;
    UPDATE public.portal_sessoes SET verificada_em = statement_timestamp() WHERE id = v_s.s_id;
    RETURN TRUE;
END;
$$;

-- O detalhe informa o método da sessão para a tela pedir senha ou código na reverificação.
CREATE OR REPLACE FUNCTION public.portal_metodo_sessao(p_sessao_hash TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT metodo FROM public.portal_sessoes WHERE token_hash = p_sessao_hash AND encerrada_em IS NULL
$$;

DO $$
DECLARE
    v_role TEXT;
    v_funcao TEXT;
BEGIN
    FOREACH v_funcao IN ARRAY ARRAY[
        'public.portal_definir_senha_contato(INTEGER, INTEGER, TEXT, INTEGER)',
        'public.portal_entrar_senha(TEXT, TEXT, TEXT)',
        'public.portal_reverificar_senha(TEXT, TEXT)',
        'public.portal_metodo_sessao(TEXT)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_funcao);
        FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_funcao, v_role);
            END IF;
        END LOOP;
    END LOOP;
    -- A Edge Function entra e reconfirma; definir senha é só pelo desktop.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.portal_entrar_senha(TEXT, TEXT, TEXT) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.portal_reverificar_senha(TEXT, TEXT) TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.portal_metodo_sessao(TEXT) TO service_role';
    END IF;
END;
$$;
