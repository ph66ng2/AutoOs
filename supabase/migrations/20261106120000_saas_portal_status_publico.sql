-- Porte SaaS (mínimo) de src-tauri/migrations/0029_portal_status_publico.sql.
-- Link público de acompanhamento (#/c/): tabelas e funções que a Edge Function
-- `public-status` usa com a chave de serviço. IDs e empresa_id são UUID.
-- Fora do escopo: o portal do cliente completo (0031–0039: versões de orçamento,
-- respostas, sessões, alertas). Idempotente.

ALTER TABLE public.equipamentos
    ADD COLUMN IF NOT EXISTS status_alterado_em timestamptz;

CREATE OR REPLACE FUNCTION public.autoos_registrar_mudanca_status_equipamento()
RETURNS trigger
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

DROP TRIGGER IF EXISTS trg_equipamentos_status_criado_em ON public.equipamentos;
CREATE TRIGGER trg_equipamentos_status_criado_em
    BEFORE INSERT ON public.equipamentos
    FOR EACH ROW
    EXECUTE FUNCTION public.autoos_registrar_mudanca_status_equipamento();

DROP TRIGGER IF EXISTS trg_equipamentos_status_alterado_em ON public.equipamentos;
CREATE TRIGGER trg_equipamentos_status_alterado_em
    BEFORE UPDATE OF status ON public.equipamentos
    FOR EACH ROW
    EXECUTE FUNCTION public.autoos_registrar_mudanca_status_equipamento();

-- Chave composta usada pela FK para impedir vínculo entre empresas diferentes.
CREATE UNIQUE INDEX IF NOT EXISTS ux_equipamentos_id_empresa
    ON public.equipamentos (id, empresa_id);

CREATE TABLE IF NOT EXISTS public.links_status_publico (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    equipamento_id uuid NOT NULL,
    token_hash text NOT NULL UNIQUE,
    criado_em timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expira_em timestamptz NOT NULL,
    revogado_em timestamptz,
    criado_por_profile_id uuid,
    revogado_por_profile_id uuid,
    ultimo_acesso_em timestamptz,
    CONSTRAINT chk_links_status_publico_hash CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_links_status_publico_expiracao CHECK (expira_em > criado_em),
    CONSTRAINT fk_links_status_publico_equipamento_empresa
        FOREIGN KEY (equipamento_id, empresa_id)
        REFERENCES public.equipamentos (id, empresa_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_links_status_publico_equipamento
    ON public.links_status_publico (empresa_id, equipamento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_links_status_publico_ativos
    ON public.links_status_publico (empresa_id, equipamento_id)
    WHERE revogado_em IS NULL;

-- Chave global de pausa: o acompanhamento público nasce desligado.
CREATE TABLE IF NOT EXISTS public.status_portal_config (
    singleton boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    public_enabled boolean NOT NULL DEFAULT FALSE,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO public.status_portal_config (singleton, public_enabled)
VALUES (TRUE, FALSE)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.status_portal_rate_limits (
    fingerprint text NOT NULL,
    janela_inicio timestamptz NOT NULL,
    tentativas integer NOT NULL DEFAULT 1,
    CONSTRAINT pk_status_portal_rate_limits PRIMARY KEY (fingerprint, janela_inicio),
    CONSTRAINT chk_status_portal_rate_limits_fingerprint CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_status_portal_rate_limits_tentativas CHECK (tentativas > 0)
);
CREATE INDEX IF NOT EXISTS idx_status_portal_rate_limits_janela
    ON public.status_portal_rate_limits (janela_inicio);

CREATE OR REPLACE FUNCTION public.consumir_limite_status_publico(
    p_fingerprint text,
    p_janela_inicio timestamptz,
    p_limite integer
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_tentativas integer;
BEGIN
    IF p_limite < 1 OR p_limite > 1000 THEN
        RAISE EXCEPTION 'Limite de requisições inválido';
    END IF;

    INSERT INTO public.status_portal_rate_limits (fingerprint, janela_inicio, tentativas)
    VALUES (p_fingerprint, p_janela_inicio, 1)
    ON CONFLICT (fingerprint, janela_inicio)
    DO UPDATE SET tentativas = public.status_portal_rate_limits.tentativas + 1
    RETURNING tentativas INTO v_tentativas;

    -- Limpeza oportunista uma vez por hora; somente janelas já expiradas.
    IF EXTRACT(MINUTE FROM p_janela_inicio) = 0
       AND EXTRACT(SECOND FROM p_janela_inicio) = 0 THEN
        DELETE FROM public.status_portal_rate_limits
        WHERE janela_inicio < statement_timestamp() - INTERVAL '1 day';
    END IF;

    RETURN v_tentativas <= p_limite;
END;
$$;

-- Só a Edge Function (chave de serviço) toca nestas tabelas. RLS sem policy
-- para authenticated/anon: nenhum acesso pelo navegador.
ALTER TABLE public.links_status_publico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_portal_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_portal_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.links_status_publico, public.status_portal_config, public.status_portal_rate_limits
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consumir_limite_status_publico(text, timestamptz, integer)
    FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE 'REVOKE ALL ON TABLE public.links_status_publico, public.status_portal_config, public.status_portal_rate_limits FROM service_role';
        EXECUTE 'GRANT SELECT ON TABLE public.links_status_publico TO service_role';
        EXECUTE 'GRANT UPDATE (ultimo_acesso_em) ON TABLE public.links_status_publico TO service_role';
        EXECUTE 'GRANT SELECT (id, empresa_id, tipo, marca, modelo, status, status_alterado_em) ON TABLE public.equipamentos TO service_role';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.status_portal_rate_limits TO service_role';
        EXECUTE 'GRANT SELECT ON TABLE public.status_portal_config TO service_role';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.consumir_limite_status_publico(text, timestamptz, integer) TO service_role';
    END IF;
END;
$$;
