-- Tema do perfil pode seguir o sistema operacional ('system'), além de claro e escuro.
-- Idempotente: troca a restrição criada em 0041 por uma que aceita o novo valor.
ALTER TABLE security_profiles DROP CONSTRAINT IF EXISTS security_profiles_tema_check;
ALTER TABLE security_profiles
    ADD CONSTRAINT security_profiles_tema_check CHECK (tema IS NULL OR tema IN ('light', 'dark', 'system'));
