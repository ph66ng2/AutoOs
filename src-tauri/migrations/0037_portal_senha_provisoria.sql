-- Portal do Cliente: senha criada pelo operador é PROVISÓRIA.
--
-- No primeiro acesso com ela, o contato cria a própria senha antes de ver qualquer atendimento:
-- a equipe deixa de conhecer a senha de quem responde orçamentos. A mesma troca serve para
-- "Esqueci minha senha": o contato entra com o código (WhatsApp/email) e define uma nova.

ALTER TABLE cliente_contatos
    ADD COLUMN IF NOT EXISTS portal_senha_provisoria BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE portal_sessoes
    ADD COLUMN IF NOT EXISTS troca_senha_pendente BOOLEAN NOT NULL DEFAULT FALSE;

-- Sem acesso não há senha (nem provisória); trocar a senha encerra as sessões abertas.
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
        NEW.portal_senha_provisoria := FALSE;
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

-- Outra senha igual no mesmo CPF/CNPJ tornaria o login ambíguo.
CREATE OR REPLACE FUNCTION public.autoos_portal_senha_em_uso(p_contato_id INTEGER, p_senha TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public, extensions
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.cliente_contatos v_c
        JOIN public.clientes meu ON meu.id = v_c.cliente_id
        JOIN public.cliente_contatos o ON o.id <> v_c.id AND o.ativo AND o.portal_senha_hash IS NOT NULL
        JOIN public.clientes cl ON cl.id = o.cliente_id AND cl.empresa_id = o.empresa_id
        WHERE v_c.id = p_contato_id
          AND COALESCE(cl.ativo, TRUE)
          AND (cl.id = meu.id
               OR (length(public.autoos_portal_digitos(COALESCE(meu.documento, meu.cpf_cnpj))) IN (11, 14)
                   AND public.autoos_portal_digitos(COALESCE(cl.documento, cl.cpf_cnpj))
                       = public.autoos_portal_digitos(COALESCE(meu.documento, meu.cpf_cnpj))))
          AND crypt(p_senha, o.portal_senha_hash) = o.portal_senha_hash
    )
$$;

-- Usada só pelo desktop (o comando Rust confere permissão e empresa antes). A senha do
-- operador nasce provisória.
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
            portal_senha_definida_por_profile_id = NULL, portal_senha_provisoria = FALSE,
            atualizado_em = NOW()
        WHERE id = v_c.id;
        RETURN NULL;
    END IF;

    IF v_c.portal_acesso = 'NENHUM' THEN
        RAISE EXCEPTION 'CONTATO_SEM_ACESSO';
    END IF;
    IF NOT public.autoos_portal_senha_valida(p_senha) THEN
        RAISE EXCEPTION 'SENHA_FRACA';
    END IF;
    IF public.autoos_portal_senha_em_uso(v_c.id, p_senha) THEN
        RAISE EXCEPTION 'SENHA_REPETIDA';
    END IF;

    UPDATE public.cliente_contatos
    SET portal_senha_hash = crypt(p_senha, gen_salt('bf', 10)),
        portal_senha_definida_em = v_agora,
        portal_senha_definida_por_profile_id = p_profile_id,
        portal_senha_provisoria = TRUE,
        atualizado_em = NOW()
    WHERE id = v_c.id;
    RETURN v_agora;
END;
$$;

-- Sessão válida. Com troca de senha pendente, só `portal_trocar_senha` aceita a sessão.
CREATE OR REPLACE FUNCTION public.autoos_portal_sessao(p_sessao_hash TEXT)
RETURNS TABLE (
    s_id BIGINT,
    s_empresa_id INTEGER,
    s_cliente_id INTEGER,
    s_contato_id INTEGER,
    s_contato_nome TEXT,
    s_acesso TEXT,
    s_verificada_em TIMESTAMPTZ
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF NOT COALESCE((SELECT portal_enabled FROM public.portal_cliente_config WHERE singleton = TRUE), FALSE) THEN
        RAISE EXCEPTION 'PORTAL_PAUSADO';
    END IF;
    IF p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.portal_sessoes
        WHERE token_hash = p_sessao_hash AND encerrada_em IS NULL AND expira_em > v_agora AND troca_senha_pendente
    ) THEN
        RAISE EXCEPTION 'TROCA_SENHA_PENDENTE';
    END IF;

    RETURN QUERY
    UPDATE public.portal_sessoes s
    SET ultimo_acesso_em = v_agora
    FROM public.cliente_contatos c, public.clientes cl
    WHERE s.token_hash = p_sessao_hash
      AND s.encerrada_em IS NULL
      AND s.expira_em > v_agora
      AND c.id = s.contato_id AND c.empresa_id = s.empresa_id AND c.cliente_id = s.cliente_id
      AND c.ativo AND c.portal_acesso <> 'NENHUM'
      AND cl.id = s.cliente_id AND cl.empresa_id = s.empresa_id AND COALESCE(cl.ativo, TRUE)
    RETURNING s.id, s.empresa_id, s.cliente_id, s.contato_id, c.nome, c.portal_acesso, s.verificada_em;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
END;
$$;

-- Entrada com CPF/CNPJ + senha. Resultado igual para documento inexistente e senha errada.
-- Senha provisória abre uma sessão que só serve para criar a senha definitiva.
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
        SELECT c.id, c.empresa_id, c.cliente_id, c.nome, c.portal_acesso, c.portal_senha_hash, c.portal_senha_provisoria
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
    IF v_candidatos = 0 THEN
        PERFORM crypt(p_senha, '$2a$10$Sp6ULFbzsJ7.LiOcTg5M1uMGnl3N8Lxhivn6tUB.I9uJ0NymrU8Sy');
    END IF;
    IF v_achados <> 1 THEN
        RETURN jsonb_build_object('resultado', 'INVALIDO');
    END IF;

    INSERT INTO public.portal_sessoes
        (token_hash, empresa_id, cliente_id, contato_id, expira_em, verificada_em, ultimo_acesso_em, metodo,
         troca_senha_pendente)
    VALUES
        (p_nova_sessao_hash, v_achado.empresa_id, v_achado.cliente_id, v_achado.id,
         v_agora + make_interval(hours => v_config.sessao_horas), v_agora, v_agora, 'SENHA',
         v_achado.portal_senha_provisoria)
    RETURNING expira_em INTO v_expira;

    RETURN jsonb_build_object(
        'resultado', 'OK',
        'contato', v_achado.nome,
        'acesso', v_achado.portal_acesso,
        'expiraEm', v_expira,
        'metodo', 'SENHA',
        'trocarSenha', v_achado.portal_senha_provisoria
    );
END;
$$;

-- O contato define a própria senha: obrigatório depois da provisória, ou logo depois de entrar
-- (verificação recente), como no "Esqueci minha senha" pelo código. A sessão atual continua.
CREATE OR REPLACE FUNCTION public.portal_trocar_senha(p_sessao_hash TEXT, p_senha_nova TEXT)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_s RECORD;
    v_c RECORD;
    v_reverificacao INTEGER;
    v_agora TIMESTAMPTZ := statement_timestamp();
BEGIN
    IF NOT COALESCE((SELECT portal_enabled FROM public.portal_cliente_config WHERE singleton = TRUE), FALSE) THEN
        RAISE EXCEPTION 'PORTAL_PAUSADO';
    END IF;
    IF p_sessao_hash IS NULL OR p_sessao_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
    SELECT s.* INTO v_s
    FROM public.portal_sessoes s
    JOIN public.cliente_contatos c ON c.id = s.contato_id AND c.empresa_id = s.empresa_id AND c.cliente_id = s.cliente_id
    JOIN public.clientes cl ON cl.id = s.cliente_id AND cl.empresa_id = s.empresa_id
    WHERE s.token_hash = p_sessao_hash AND s.encerrada_em IS NULL AND s.expira_em > v_agora
      AND c.ativo AND c.portal_acesso <> 'NENHUM' AND COALESCE(cl.ativo, TRUE)
    FOR UPDATE OF s;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'SESSAO_INVALIDA';
    END IF;
    SELECT reverificacao_minutos INTO v_reverificacao FROM public.portal_cliente_config WHERE singleton = TRUE;
    IF NOT v_s.troca_senha_pendente
       AND v_s.verificada_em < v_agora - make_interval(mins => COALESCE(v_reverificacao, 10)) THEN
        RAISE EXCEPTION 'VERIFICACAO_NECESSARIA';
    END IF;

    SELECT * INTO v_c FROM public.cliente_contatos WHERE id = v_s.contato_id FOR UPDATE;
    IF NOT public.autoos_portal_senha_valida(p_senha_nova) THEN
        RAISE EXCEPTION 'SENHA_FRACA';
    END IF;
    IF v_c.portal_senha_hash IS NOT NULL AND crypt(p_senha_nova, v_c.portal_senha_hash) = v_c.portal_senha_hash THEN
        RAISE EXCEPTION 'SENHA_IGUAL';
    END IF;
    IF public.autoos_portal_senha_em_uso(v_c.id, p_senha_nova) THEN
        RAISE EXCEPTION 'SENHA_REPETIDA';
    END IF;

    -- O gatilho encerra as sessões do contato (outros aparelhos); esta é reaberta em seguida.
    UPDATE public.cliente_contatos
    SET portal_senha_hash = crypt(p_senha_nova, gen_salt('bf', 10)),
        portal_senha_definida_em = v_agora,
        portal_senha_definida_por_profile_id = NULL,
        portal_senha_provisoria = FALSE,
        atualizado_em = NOW()
    WHERE id = v_c.id;
    UPDATE public.portal_sessoes
    SET encerrada_em = NULL, encerrada_motivo = NULL, troca_senha_pendente = FALSE, verificada_em = v_agora
    WHERE id = v_s.id;

    RETURN 'OK';
END;
$$;

DO $$
DECLARE
    v_role TEXT;
    v_funcao TEXT;
BEGIN
    FOREACH v_funcao IN ARRAY ARRAY[
        'public.autoos_portal_senha_em_uso(INTEGER, TEXT)',
        'public.portal_trocar_senha(TEXT, TEXT)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_funcao);
        FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_funcao, v_role);
            END IF;
        END LOOP;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.portal_trocar_senha(TEXT, TEXT) TO service_role';
    END IF;
END $$;
