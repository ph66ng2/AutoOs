-- Permite que ciclos de manutenção do mesmo equipamento reutilizem o patrimônio.
--
-- O índice único da migration 0003 impedia qualquer repetição de patrimônio,
-- inclusive quando a série era a mesma. Um índice composto não resolveria o
-- caso de negócio: ele também permitiria o mesmo patrimônio em séries
-- diferentes. A trigger abaixo mantém a relação patrimônio -> série e permite
-- somente repetições dentro da mesma série.

DROP INDEX IF EXISTS ux_equipamentos_patrimonio_when_present;

CREATE OR REPLACE FUNCTION autoos_validar_patrimonio_por_serie()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    patrimonio_normalizado TEXT;
    serie_normalizada TEXT;
BEGIN
    patrimonio_normalizado := NULLIF(LOWER(BTRIM(NEW.patrimonio)), '');
    IF patrimonio_normalizado IS NULL THEN
        RETURN NEW;
    END IF;

    serie_normalizada := LOWER(BTRIM(NEW.serial_number));

    -- Serializa gravações concorrentes do mesmo patrimônio. Sem esse lock,
    -- duas transações poderiam consultar antes de qualquer uma enxergar o
    -- INSERT da outra e ambas poderiam associar séries diferentes.
    PERFORM pg_advisory_xact_lock(hashtextextended(patrimonio_normalizado, 0));

    IF EXISTS (
        SELECT 1
        FROM equipamentos AS existente
        WHERE existente.id <> COALESCE(NEW.id, -1)
          AND NULLIF(LOWER(BTRIM(existente.patrimonio)), '') = patrimonio_normalizado
          AND LOWER(BTRIM(existente.serial_number)) <> serie_normalizada
    ) THEN
        RAISE EXCEPTION 'AUTOOS_PATRIMONIO_SERIAL_CONFLICT: patrimônio já associado a outro número de série'
            USING ERRCODE = '23505',
                  CONSTRAINT = 'ux_equipamentos_patrimonio_when_present';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipamentos_patrimonio_por_serie ON equipamentos;

CREATE TRIGGER trg_equipamentos_patrimonio_por_serie
    BEFORE INSERT OR UPDATE OF serial_number, patrimonio ON equipamentos
    FOR EACH ROW
    EXECUTE FUNCTION autoos_validar_patrimonio_por_serie();
