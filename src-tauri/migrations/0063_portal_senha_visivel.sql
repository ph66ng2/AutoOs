-- Senha do portal visível para a equipe (decisão do responsável do produto, 24/11/2026).
--
-- O login do portal continua conferindo só o hash bcrypt de `cliente_contatos.portal_senha_hash`
-- (0036). Esta tabela guarda, à parte, a senha que a EQUIPE definiu, para o operador poder
-- consultá-la e repassar ao cliente sem trocar a senha. Risco aceito: quem lê esta tabela (ou um
-- backup do banco) lê as senhas. Por isso:
--   * só entram senhas definidas pelo app (equipe); nada aqui é preenchido pelo portal;
--   * a leitura só devolve a senha se o hash guardado junto ainda é o hash atual do contato,
--     então senha trocada, removida ou zerada por outro caminho deixa de aparecer sozinha;
--   * RLS ligado sem política e funções revogadas de anon/authenticated/service_role: a edge
--     function do portal e a API do Supabase não leem nada daqui.

CREATE TABLE IF NOT EXISTS public.portal_senhas_visiveis (
    contato_id INTEGER PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    senha TEXT NOT NULL,
    -- Hash de `cliente_contatos.portal_senha_hash` no momento em que a senha foi guardada.
    senha_hash TEXT NOT NULL,
    definida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    definida_por_profile_id INTEGER REFERENCES public.security_profiles(id) ON DELETE SET NULL,
    CONSTRAINT fk_portal_senhas_visiveis_contato
        FOREIGN KEY (contato_id) REFERENCES public.cliente_contatos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_portal_senhas_visiveis_empresa ON public.portal_senhas_visiveis (empresa_id);

ALTER TABLE public.portal_senhas_visiveis ENABLE ROW LEVEL SECURITY;

-- Guarda (ou apaga, com p_senha NULL) a senha que acabou de ser definida por
-- `portal_definir_senha_contato`, na mesma transação. Só guarda se a senha confere com o hash atual.
CREATE OR REPLACE FUNCTION public.portal_guardar_senha_visivel(
    p_empresa_id INTEGER,
    p_contato_id INTEGER,
    p_senha TEXT,
    p_profile_id INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
    v_hash TEXT;
BEGIN
    IF p_senha IS NULL THEN
        DELETE FROM public.portal_senhas_visiveis WHERE contato_id = p_contato_id AND empresa_id = p_empresa_id;
        RETURN;
    END IF;

    SELECT portal_senha_hash INTO v_hash
    FROM public.cliente_contatos
    WHERE id = p_contato_id AND empresa_id = p_empresa_id;
    IF v_hash IS NULL OR crypt(p_senha, v_hash) <> v_hash THEN
        RAISE EXCEPTION 'SENHA_NAO_CONFERE';
    END IF;

    INSERT INTO public.portal_senhas_visiveis (contato_id, empresa_id, senha, senha_hash, definida_em, definida_por_profile_id)
    VALUES (p_contato_id, p_empresa_id, p_senha, v_hash, NOW(), p_profile_id)
    ON CONFLICT (contato_id) DO UPDATE
        SET empresa_id = EXCLUDED.empresa_id,
            senha = EXCLUDED.senha,
            senha_hash = EXCLUDED.senha_hash,
            definida_em = EXCLUDED.definida_em,
            definida_por_profile_id = EXCLUDED.definida_por_profile_id;
END;
$$;

-- Senha atual do contato, ou NULL quando a senha guardada já não é a que vale (ou nunca foi guardada).
CREATE OR REPLACE FUNCTION public.portal_ler_senha_visivel(p_empresa_id INTEGER, p_contato_id INTEGER)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
    SELECT v.senha
    FROM public.portal_senhas_visiveis v
    JOIN public.cliente_contatos c ON c.id = v.contato_id AND c.empresa_id = v.empresa_id
    WHERE v.contato_id = p_contato_id
      AND v.empresa_id = p_empresa_id
      AND c.ativo
      AND c.portal_senha_hash IS NOT NULL
      AND c.portal_senha_hash = v.senha_hash
$$;

DO $$
DECLARE
    v_role TEXT;
    v_funcao TEXT;
BEGIN
    FOREACH v_funcao IN ARRAY ARRAY[
        'public.portal_guardar_senha_visivel(INTEGER, INTEGER, TEXT, INTEGER)',
        'public.portal_ler_senha_visivel(INTEGER, INTEGER)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_funcao);
        FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
                EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', v_funcao, v_role);
            END IF;
        END LOOP;
    END LOOP;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.portal_senhas_visiveis FROM %I', v_role);
        END IF;
    END LOOP;
END;
$$;
