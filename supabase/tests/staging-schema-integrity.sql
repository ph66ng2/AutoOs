-- Executado somente no Supabase staging. Todos os dados de teste são
-- descartados por ROLLBACK ao fim do arquivo. O script que o invoca abre a
-- transação antes de carregar este arquivo.

DO $$
DECLARE
    checked_table text;
    schema_column_type text;
    schema_column_default text;
BEGIN
    FOREACH checked_table IN ARRAY ARRAY[
        'clientes', 'equipamentos', 'produtos', 'movimentacoes_estoque',
        'security_profiles', 'verificacoes', 'comunicacoes',
        'security_audit_log', 'equipamento_imagens', 'servicos_catalogo',
        'gastos_fixos', 'gastos_variaveis', 'configuracoes_sistema'
    ] LOOP
        SELECT columns.data_type, columns.column_default
          INTO schema_column_type, schema_column_default
          FROM information_schema.columns AS columns
         WHERE columns.table_schema = 'public'
           AND columns.table_name = checked_table
           AND columns.column_name = 'empresa_id';

        IF schema_column_type IS DISTINCT FROM 'uuid' THEN
            RAISE EXCEPTION '% must expose empresa_id as uuid, got %', checked_table, schema_column_type;
        END IF;

        IF schema_column_default IS NOT NULL THEN
            RAISE EXCEPTION '% must not default empresa_id, got %', checked_table, schema_column_default;
        END IF;
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_equipamentos_cliente_empresa')
       OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_movimentacoes_produto_empresa') THEN
        RAISE EXCEPTION 'tenant-safe composite foreign keys are missing';
    END IF;
END;
$$;

INSERT INTO empresas (id, nome) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Schema test A'),
    ('22222222-2222-2222-2222-222222222222', 'Schema test B');

INSERT INTO clientes (id, empresa_id, nome) VALUES
    ('11111111-1111-1111-1111-111111111112', '11111111-1111-1111-1111-111111111111', 'Cliente A'),
    ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'Cliente B');

INSERT INTO produtos (id, empresa_id, codigo, nome, categoria, preco_custo, preco_venda) VALUES
    ('11111111-1111-1111-1111-111111111113', '11111111-1111-1111-1111-111111111111', 'TEST-A', 'Produto A', 'Teste', 1, 2),
    ('22222222-2222-2222-2222-222222222223', '22222222-2222-2222-2222-222222222222', 'TEST-B', 'Produto B', 'Teste', 1, 2);

DO $$
BEGIN
    INSERT INTO equipamentos (empresa_id, serial_number, marca, modelo, tipo, data_entrada, defeito_relatado, cliente_id)
    VALUES ('11111111-1111-1111-1111-111111111111', 'CROSS-TENANT-CLIENTE', 'AutoOS', 'Teste', 'Impressora', '2026-08-19', 'Teste', '22222222-2222-2222-2222-222222222222');
    RAISE EXCEPTION 'cross-tenant equipment/client FK was accepted';
EXCEPTION WHEN foreign_key_violation THEN NULL;
END;
$$;

DO $$
BEGIN
    INSERT INTO movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, origem)
    VALUES ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222223', 'ENTRADA', 1, 'Teste');
    RAISE EXCEPTION 'cross-tenant movement/product FK was accepted';
EXCEPTION WHEN foreign_key_violation THEN NULL;
END;
$$;

ROLLBACK;
