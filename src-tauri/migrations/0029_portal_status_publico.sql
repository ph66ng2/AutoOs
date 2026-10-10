-- Portal público de acompanhamento por link de capacidade individual.
-- Os atendimentos antigos não recebem data inferida para a mudança de status.

ALTER TABLE equipamentos
    ADD COLUMN IF NOT EXISTS status_alterado_em TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION autoos_registrar_mudanca_status_equipamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.status_alterado_em := COALESCE(NEW.status_alterado_em, statement_timestamp());
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.status_alterado_em := statement_timestamp();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipamentos_status_criado_em ON equipamentos;
CREATE TRIGGER trg_equipamentos_status_criado_em
    BEFORE INSERT ON equipamentos
    FOR EACH ROW
    EXECUTE FUNCTION autoos_registrar_mudanca_status_equipamento();

DROP TRIGGER IF EXISTS trg_equipamentos_status_alterado_em ON equipamentos;
CREATE TRIGGER trg_equipamentos_status_alterado_em
    BEFORE UPDATE OF status ON equipamentos
    FOR EACH ROW
    EXECUTE FUNCTION autoos_registrar_mudanca_status_equipamento();

-- Chave composta usada pela FK para impedir vínculo entre tenants diferentes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_equipamentos_id_empresa
    ON equipamentos (id, empresa_id);

CREATE TABLE IF NOT EXISTS links_status_publico (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    equipamento_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em TIMESTAMPTZ NOT NULL,
    revogado_em TIMESTAMPTZ,
    criado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    revogado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    ultimo_acesso_em TIMESTAMPTZ,
    CONSTRAINT chk_links_status_publico_hash
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_links_status_publico_expiracao
        CHECK (expira_em > criado_em),
    CONSTRAINT fk_links_status_publico_equipamento_empresa
        FOREIGN KEY (equipamento_id, empresa_id)
        REFERENCES equipamentos (id, empresa_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_status_publico_equipamento
    ON links_status_publico (empresa_id, equipamento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_links_status_publico_ativos
    ON links_status_publico (empresa_id, equipamento_id)
    WHERE revogado_em IS NULL;

-- Chave global de pausa. O piloto só é ativado após liberação administrativa.
CREATE TABLE IF NOT EXISTS public.status_portal_config (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    public_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO public.status_portal_config (singleton, public_enabled)
VALUES (TRUE, FALSE)
ON CONFLICT (singleton) DO NOTHING;
ALTER TABLE public.status_portal_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.status_portal_config FROM PUBLIC;

ALTER TABLE links_status_publico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE links_status_publico FROM PUBLIC;
DROP POLICY IF EXISTS links_status_publico_empresa ON links_status_publico;
CREATE POLICY links_status_publico_empresa ON links_status_publico
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

-- Fingerprints HMAC do limite global e de cada token são mantidos em janelas curtas.
CREATE TABLE IF NOT EXISTS status_portal_rate_limits (
    fingerprint TEXT NOT NULL,
    janela_inicio TIMESTAMPTZ NOT NULL,
    tentativas INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT pk_status_portal_rate_limits PRIMARY KEY (fingerprint, janela_inicio),
    CONSTRAINT chk_status_portal_rate_limits_fingerprint
        CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_status_portal_rate_limits_tentativas
        CHECK (tentativas > 0)
);

CREATE INDEX IF NOT EXISTS idx_status_portal_rate_limits_janela
    ON status_portal_rate_limits (janela_inicio);
ALTER TABLE status_portal_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE status_portal_rate_limits FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.consumir_limite_status_publico(
    p_fingerprint TEXT,
    p_janela_inicio TIMESTAMPTZ,
    p_limite INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tentativas INTEGER;
BEGIN
    IF p_limite < 1 OR p_limite > 1000 THEN
        RAISE EXCEPTION 'Limite de requisições inválido';
    END IF;

    INSERT INTO public.status_portal_rate_limits (fingerprint, janela_inicio, tentativas)
    VALUES (p_fingerprint, p_janela_inicio, 1)
    ON CONFLICT (fingerprint, janela_inicio)
    DO UPDATE SET tentativas = public.status_portal_rate_limits.tentativas + 1
    RETURNING tentativas INTO v_tentativas;

    -- Limpeza oportunista uma vez por hora; somente fingerprints já expirados.
    IF EXTRACT(MINUTE FROM p_janela_inicio) = 0
       AND EXTRACT(SECOND FROM p_janela_inicio) = 0 THEN
        DELETE FROM public.status_portal_rate_limits
        WHERE janela_inicio < statement_timestamp() - INTERVAL '1 day';
    END IF;

    RETURN v_tentativas <= p_limite;
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_limite_status_publico(TEXT, TIMESTAMPTZ, INTEGER) FROM PUBLIC;

-- O Edge Function usa uma chave Supabase privilegiada no servidor. O navegador
-- não recebe privilégios de leitura ou escrita nestas tabelas.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.links_status_publico FROM anon';
        EXECUTE 'REVOKE ALL ON TABLE public.status_portal_rate_limits FROM anon';
        EXECUTE 'REVOKE ALL ON TABLE public.status_portal_config FROM anon';
        EXECUTE 'REVOKE ALL ON FUNCTION public.consumir_limite_status_publico(TEXT, TIMESTAMPTZ, INTEGER) FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.links_status_publico FROM authenticated';
        EXECUTE 'REVOKE ALL ON TABLE public.status_portal_rate_limits FROM authenticated';
        EXECUTE 'REVOKE ALL ON TABLE public.status_portal_config FROM authenticated';
        EXECUTE 'REVOKE ALL ON FUNCTION public.consumir_limite_status_publico(TEXT, TIMESTAMPTZ, INTEGER) FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.links_status_publico FROM service_role';
        EXECUTE 'REVOKE ALL ON TABLE public.status_portal_rate_limits FROM service_role';
        EXECUTE 'REVOKE ALL ON TABLE public.status_portal_config FROM service_role';
        EXECUTE 'REVOKE ALL ON FUNCTION public.consumir_limite_status_publico(TEXT, TIMESTAMPTZ, INTEGER) FROM service_role';
        EXECUTE 'GRANT SELECT ON TABLE public.links_status_publico TO service_role';
        EXECUTE 'GRANT UPDATE (ultimo_acesso_em) ON TABLE public.links_status_publico TO service_role';
        EXECUTE 'GRANT SELECT (id, empresa_id, tipo, marca, modelo, status, status_alterado_em) ON TABLE public.equipamentos TO service_role';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.status_portal_rate_limits TO service_role';
        EXECUTE 'GRANT SELECT ON TABLE public.status_portal_config TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.consumir_limite_status_publico(TEXT, TIMESTAMPTZ, INTEGER) TO service_role';
    END IF;
END;
$$;
