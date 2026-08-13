-- Credencial de conta da empresa (hash Argon2; nunca senha em texto puro).
-- Esta coluna corrige o login legado, que aceitava qualquer senha para um
-- email ativo. Ela é uma ponte para a migração final ao Supabase Auth.
ALTER TABLE empresas
    ADD COLUMN IF NOT EXISTS senha_hash TEXT;
