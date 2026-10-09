-- Existing installations may contain legacy equipment rows without a version
-- token. Backfill before making optimistic concurrency mandatory.
UPDATE equipamentos
SET atualizado_em = COALESCE(criado_em, CURRENT_TIMESTAMP::TIMESTAMP)
WHERE atualizado_em IS NULL;

ALTER TABLE equipamentos
    ALTER COLUMN atualizado_em SET NOT NULL;
