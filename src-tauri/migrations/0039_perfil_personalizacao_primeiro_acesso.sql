-- 0039: Personalização do perfil, primeiro acesso por código e tour por permissão.
--
-- 1. Cada perfil guarda seu visual (ícone e cor pré-definidos, tema claro/escuro). São preferências
--    da pessoa, por isso ficam no banco e valem em qualquer computador.
-- 2. `onboarding_concluido_em` marca quem já passou pelo primeiro acesso. Perfis que já existiam
--    são considerados concluídos: a pessoa já usa o sistema e não precisa refazer a entrada.
-- 3. `tour_permissoes_vistas` guarda (JSON, mesmo formato de `permissions`) as permissões que o tour
--    já apresentou. NULL = nunca viu o tour. O tour de novidades mostra o que está em `permissions`
--    e ainda não está aqui.
-- 4. `codigos_primeiro_acesso` libera um perfil em um computador sem PIN local. Guarda apenas o hash
--    do código, expira e vale para um uso. O PIN definitivo continua só no keyring do computador.

ALTER TABLE security_profiles ADD COLUMN IF NOT EXISTS avatar_icone TEXT;
ALTER TABLE security_profiles ADD COLUMN IF NOT EXISTS avatar_cor TEXT;
ALTER TABLE security_profiles ADD COLUMN IF NOT EXISTS tema TEXT;
ALTER TABLE security_profiles ADD COLUMN IF NOT EXISTS onboarding_concluido_em TIMESTAMPTZ;
ALTER TABLE security_profiles ADD COLUMN IF NOT EXISTS tour_permissoes_vistas TEXT;

DO $$ BEGIN
    ALTER TABLE security_profiles
        ADD CONSTRAINT security_profiles_tema_check CHECK (tema IS NULL OR tema IN ('light', 'dark'));
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

DO $$ BEGIN
    ALTER TABLE security_profiles
        ADD CONSTRAINT security_profiles_avatar_cor_check CHECK (avatar_cor IS NULL OR avatar_cor ~ '^#[0-9A-F]{6}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END; $$;

UPDATE security_profiles
   SET onboarding_concluido_em = COALESCE(criado_em, CURRENT_TIMESTAMP)
 WHERE onboarding_concluido_em IS NULL;

CREATE TABLE IF NOT EXISTS codigos_primeiro_acesso (
    id SERIAL PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES security_profiles(id) ON DELETE CASCADE,
    codigo_hash TEXT NOT NULL,
    expira_em TIMESTAMPTZ NOT NULL,
    usado_em TIMESTAMPTZ,
    revogado_em TIMESTAMPTZ,
    criado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_codigos_primeiro_acesso_abertos
    ON codigos_primeiro_acesso (profile_id)
    WHERE usado_em IS NULL AND revogado_em IS NULL;

-- Hash de código de acesso nunca fica visível pela API pública do Supabase.
-- O desktop conecta como dono da tabela e não é afetado pelo RLS.
ALTER TABLE codigos_primeiro_acesso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE codigos_primeiro_acesso FROM PUBLIC;

DO $$
DECLARE
    v_role TEXT;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            EXECUTE format('REVOKE ALL ON TABLE public.codigos_primeiro_acesso FROM %I', v_role);
        END IF;
    END LOOP;
END;
$$;
