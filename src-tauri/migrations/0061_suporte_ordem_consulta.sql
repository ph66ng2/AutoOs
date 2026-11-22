ALTER TABLE public.suporte_chamados ADD COLUMN IF NOT EXISTS consultado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_suporte_chamados_consulta
    ON public.suporte_chamados (empresa_id, profile_id, consultado_em NULLS FIRST, id)
    WHERE situacao = 'aberto' AND slack_thread_ts IS NOT NULL AND slack_canal IS NOT NULL;

-- Orçamento de consultas e pausa da API compartilhados por todas as estações.
ALTER TABLE public.configuracoes_sistema
    ADD COLUMN IF NOT EXISTS suporte_consulta_janela TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suporte_consulta_total INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS suporte_consulta_pausada_ate TIMESTAMPTZ;

-- O giro do poller não muda a conversa nem dispara uma recarga ao vivo.
DROP TRIGGER IF EXISTS trg_avisar_mudanca ON public.suporte_chamados;
CREATE TRIGGER trg_avisar_mudanca AFTER INSERT OR DELETE ON public.suporte_chamados
    FOR EACH ROW EXECUTE FUNCTION public.avisar_mudanca();

DROP TRIGGER IF EXISTS trg_avisar_mudanca_edicao ON public.suporte_chamados;
CREATE TRIGGER trg_avisar_mudanca_edicao AFTER UPDATE ON public.suporte_chamados
    FOR EACH ROW
    WHEN ((to_jsonb(OLD) - 'consultado_em') IS DISTINCT FROM (to_jsonb(NEW) - 'consultado_em'))
    EXECUTE FUNCTION public.avisar_mudanca();
