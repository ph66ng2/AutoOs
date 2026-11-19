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

-- Instalação interna: e-mails confirmados pelo responsável para Ivan, Isaías e
-- Aline, os mesmos que o sistema já usava nos PDFs. Só preenche quando o
-- primeiro nome (sem acento) identifica um único perfil e o e-mail está vazio;
-- havendo dois "Ivan", nenhum recebe e o administrador completa na tela.
WITH candidatos AS (
  SELECT id, translate(lower(split_part(btrim(nome), ' ', 1)), 'áíã', 'aia') AS primeiro
  FROM security_profiles
), unicos AS (
  SELECT primeiro, MIN(id) AS id
  FROM candidatos
  WHERE primeiro IN ('ivan', 'isaias', 'aline')
  GROUP BY primeiro
  HAVING COUNT(*) = 1
)
UPDATE security_profiles sp
SET email_profissional = CASE WHEN sp.email_profissional IS NULL THEN u.primeiro || '@bmitag.com.br' ELSE sp.email_profissional END,
    atende_tecnico = sp.atende_tecnico OR u.primeiro IN ('ivan', 'isaias'),
    atualizado_em = NOW()
FROM unicos u
WHERE sp.id = u.id
  AND (sp.email_profissional IS NULL OR (u.primeiro IN ('ivan', 'isaias') AND NOT sp.atende_tecnico));
