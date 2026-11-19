-- Técnicos da OS deixam de ser uma lista fixa no código ("Ivan", "Isaias") e passam a ser os
-- perfis marcados como "faz atendimento técnico". Cada perfil ganha o e-mail profissional,
-- usado na cópia dos e-mails da OS e no PDF (antes também fixo no código).
-- OS antigas não mudam: verificacoes.tecnico_nome continua o texto gravado na época.
ALTER TABLE security_profiles ADD COLUMN IF NOT EXISTS email_profissional TEXT;
ALTER TABLE security_profiles ADD COLUMN IF NOT EXISTS atende_tecnico BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    ALTER TABLE security_profiles
        ADD CONSTRAINT chk_security_profiles_email_profissional
        CHECK (email_profissional IS NULL OR email_profissional ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- Transição sem adivinhar por nome: quem já tem o papel de Técnico continua aparecendo como técnico.
UPDATE security_profiles
   SET atende_tecnico = TRUE, atualizado_em = NOW()
 WHERE role = 'TECNICO' AND atende_tecnico = FALSE;
