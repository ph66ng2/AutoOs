-- Suporte pelo Slack (só a BMITAG): cada chamado vira uma thread no canal configurado. O
-- texto e o contexto ficam aqui para o histórico em qualquer computador; prints vão só para
-- o Slack. O token do bot fica no cofre do sistema de cada computador, nunca no banco.
ALTER TABLE public.configuracoes_sistema ADD COLUMN IF NOT EXISTS suporte_slack_canal TEXT;

CREATE TABLE IF NOT EXISTS public.suporte_chamados (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL,
    texto TEXT NOT NULL,
    contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
    slack_canal TEXT,
    slack_thread_ts TEXT,
    situacao TEXT NOT NULL DEFAULT 'aberto',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, empresa_id),
    FOREIGN KEY (profile_id, empresa_id) REFERENCES public.security_profiles(id, empresa_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_suporte_chamados_texto CHECK (char_length(btrim(texto)) BETWEEN 1 AND 4000),
    CONSTRAINT chk_suporte_chamados_situacao CHECK (situacao IN ('aberto', 'resolvido'))
);

CREATE INDEX IF NOT EXISTS idx_suporte_chamados_perfil ON public.suporte_chamados (empresa_id, profile_id, criado_em DESC);

-- Conversa do chamado: a mensagem de quem abriu e as respostas que vêm da thread do Slack.
CREATE TABLE IF NOT EXISTS public.suporte_mensagens (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    chamado_id INTEGER NOT NULL,
    autor TEXT NOT NULL,
    autor_nome TEXT,
    texto TEXT NOT NULL,
    automatica BOOLEAN NOT NULL DEFAULT FALSE,
    slack_ts TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, empresa_id),
    UNIQUE (chamado_id, slack_ts),
    FOREIGN KEY (chamado_id, empresa_id) REFERENCES public.suporte_chamados(id, empresa_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_suporte_mensagens_autor CHECK (autor IN ('pessoa', 'suporte'))
);

CREATE INDEX IF NOT EXISTS idx_suporte_mensagens_chamado ON public.suporte_mensagens (chamado_id, criado_em);

ALTER TABLE public.suporte_chamados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_mensagens ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_avisar_mudanca ON public.suporte_chamados;
CREATE TRIGGER trg_avisar_mudanca AFTER INSERT OR UPDATE OR DELETE ON public.suporte_chamados
    FOR EACH ROW EXECUTE FUNCTION public.avisar_mudanca();
DROP TRIGGER IF EXISTS trg_avisar_mudanca ON public.suporte_mensagens;
CREATE TRIGGER trg_avisar_mudanca AFTER INSERT OR UPDATE OR DELETE ON public.suporte_mensagens
    FOR EACH ROW EXECUTE FUNCTION public.avisar_mudanca();
