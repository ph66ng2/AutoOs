-- Executar no Supabase staging após schema.sql, seed.sql e rls.sql.
-- O teste usa dois tenants sintéticos e termina sempre com ROLLBACK. O
-- arquivo abre a própria transação para que os dados de teste sejam
-- descartados mesmo quando executado diretamente.
BEGIN;

INSERT INTO empresas (id, nome) VALUES
    ('33333333-3333-4333-8333-333333333331', 'RLS test A'),
    ('44444444-4444-4444-8444-444444444441', 'RLS test B');

INSERT INTO clientes (id, empresa_id, nome) VALUES
    ('33333333-3333-4333-8333-333333333332', '33333333-3333-4333-8333-333333333331', 'RLS Cliente A'),
    ('44444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444441', 'RLS Cliente B');

SET LOCAL ROLE authenticated;
SELECT set_config(
    'request.jwt.claims',
    '{"sub":"55555555-5555-4555-8555-555555555551","app_metadata":{"company_id":"33333333-3333-4333-8333-333333333331"}}',
    true
);

DO $$
DECLARE
    visible_rows integer;
    changed_rows integer;
BEGIN
    SELECT count(*) INTO visible_rows FROM clientes;
    IF visible_rows <> 1 THEN
        RAISE EXCEPTION 'tenant A can see % client rows, expected 1', visible_rows;
    END IF;

    INSERT INTO clientes (id, empresa_id, nome)
    VALUES ('33333333-3333-4333-8333-333333333334', '33333333-3333-4333-8333-333333333331', 'RLS Cliente A novo');

    SELECT count(*) INTO visible_rows FROM clientes;
    IF visible_rows <> 2 THEN
        RAISE EXCEPTION 'tenant A cannot insert in its own tenant';
    END IF;

    UPDATE clientes
     SET nome = 'cross-tenant update'
     WHERE id = '44444444-4444-4444-8444-444444444442';
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 0 THEN
        RAISE EXCEPTION 'tenant A updated tenant B data';
    END IF;

    BEGIN
        INSERT INTO clientes (id, empresa_id, nome)
        VALUES ('33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444441', 'forbidden');
        RAISE EXCEPTION 'tenant A inserted data for tenant B';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;

SELECT set_config(
    'request.jwt.claims',
    '{"sub":"66666666-6666-4666-8666-666666666661","app_metadata":{"company_id":"44444444-4444-4444-8444-444444444441"}}',
    true
);

DO $$
DECLARE
    visible_rows integer;
BEGIN
    SELECT count(*) INTO visible_rows FROM clientes;
    IF visible_rows <> 1 THEN
        RAISE EXCEPTION 'tenant B can see % client rows, expected 1', visible_rows;
    END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{}', true);
DO $$
DECLARE
    visible_rows integer;
BEGIN
    SELECT count(*) INTO visible_rows FROM clientes;
    IF visible_rows <> 0 THEN
        RAISE EXCEPTION 'a JWT without company_id can see % client rows', visible_rows;
    END IF;
END;
$$;

ROLLBACK;
