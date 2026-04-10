ALTER TABLE equipamentos
    ADD COLUMN IF NOT EXISTS patrimonio TEXT,
    ADD COLUMN IF NOT EXISTS defeito_relatado TEXT,
    ADD COLUMN IF NOT EXISTS acessorios TEXT,
    ADD COLUMN IF NOT EXISTS acessorios_outros TEXT;

UPDATE equipamentos
SET patrimonio = NULLIF(BTRIM(patrimonio), ''),
    defeito_relatado = NULLIF(BTRIM(defeito_relatado), ''),
    acessorios = NULLIF(BTRIM(acessorios), ''),
    acessorios_outros = NULLIF(BTRIM(acessorios_outros), '');

ALTER TABLE equipamentos
    ADD CONSTRAINT chk_equipamentos_patrimonio_not_blank
        CHECK (patrimonio IS NULL OR BTRIM(patrimonio) <> '') NOT VALID,
    ADD CONSTRAINT chk_equipamentos_defeito_relatado_not_blank
        CHECK (COALESCE(BTRIM(defeito_relatado), '') <> '') NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_equipamentos_patrimonio_when_present
    ON equipamentos ((LOWER(BTRIM(patrimonio))))
    WHERE NULLIF(BTRIM(patrimonio), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipamentos_patrimonio
    ON equipamentos (patrimonio)
    WHERE NULLIF(BTRIM(patrimonio), '') IS NOT NULL;