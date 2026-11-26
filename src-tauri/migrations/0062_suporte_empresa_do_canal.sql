-- O canal compartilhado precisa de uma empresa explícita em instalações multiempresa.
ALTER TABLE public.configuracoes_sistema
    ADD COLUMN IF NOT EXISTS suporte_slack_empresa_id INTEGER
    REFERENCES public.empresas(id) ON DELETE SET NULL;
