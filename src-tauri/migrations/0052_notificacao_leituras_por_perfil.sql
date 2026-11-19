-- Notificações lidas por perfil: cada pessoa tem o seu "lido" (antes, ler um alerta do
-- portal marcava para a empresa toda). `chave` identifica a notificação:
--   'portal:<id>'           alerta do portal (portal_alertas.id)
--   '<tipo>:<ref>:<marco>'  aviso interno calculado (ex.: 'vence-amanha:42:2026-11-20')
-- Leituras antigas (portal_alertas.lido_em) continuam valendo para todos.

-- O perfil da leitura é da mesma empresa (FK composta). A empresa da sessão já vem de
-- security_profiles.empresa_id, então toda leitura gravada pelo app satisfaz a chave.
DO $$
BEGIN
    ALTER TABLE public.security_profiles
        ADD CONSTRAINT uq_security_profiles_id_empresa UNIQUE (id, empresa_id);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL;
END;
$$;

CREATE TABLE IF NOT EXISTS public.notificacao_leituras (
    id BIGSERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    profile_id INTEGER NOT NULL,
    chave TEXT NOT NULL,
    lido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, empresa_id),
    UNIQUE (empresa_id, profile_id, chave),
    FOREIGN KEY (profile_id, empresa_id) REFERENCES public.security_profiles(id, empresa_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_notificacao_leituras_chave CHECK (char_length(chave) BETWEEN 3 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_notificacao_leituras_perfil
    ON public.notificacao_leituras (empresa_id, profile_id);

ALTER TABLE public.notificacao_leituras ENABLE ROW LEVEL SECURITY;
