-- Notificações lidas por perfil: cada pessoa tem o seu "lido" (antes, ler um alerta do
-- portal marcava para a empresa toda). `chave` identifica a notificação:
--   'portal:<id>'           alerta do portal (portal_alertas.id)
--   '<tipo>:<ref>:<marco>'  aviso interno calculado (ex.: 'vence-amanha:42:2026-11-20')
-- Leituras antigas (portal_alertas.lido_em) continuam valendo para todos.
CREATE TABLE IF NOT EXISTS public.notificacao_leituras (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL REFERENCES public.security_profiles(id) ON DELETE CASCADE,
    chave TEXT NOT NULL,
    lido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, empresa_id),
    UNIQUE (empresa_id, profile_id, chave),
    CONSTRAINT chk_notificacao_leituras_chave CHECK (char_length(chave) BETWEEN 3 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_notificacao_leituras_perfil
    ON public.notificacao_leituras (empresa_id, profile_id);

ALTER TABLE public.notificacao_leituras ENABLE ROW LEVEL SECURITY;
