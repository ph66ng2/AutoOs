-- Contrato SQL de contatos, snapshots e pagamento.
-- Execute com: psql --set ON_ERROR_STOP=1 --file=supabase/tests/contatos_pagamento_contract.sql
-- O teste é transacional e usa somente dados sintéticos TESTE-CONTATO.

BEGIN;

DO $$
DECLARE
    tenant_a UUID := gen_random_uuid();
    tenant_b UUID := gen_random_uuid();
    client_a UUID := gen_random_uuid();
    client_b UUID := gen_random_uuid();
    contact_a UUID := gen_random_uuid();
    contact_b UUID := gen_random_uuid();
    equipment_a UUID := gen_random_uuid();
    verification_a UUID := gen_random_uuid();
    snapshot_name TEXT;
    snapshot_email TEXT;
    snapshot_phone TEXT;
    current_status TEXT;
    current_payment TEXT;
BEGIN
    PERFORM set_config('app.empresa_id', tenant_a::TEXT, true);

    INSERT INTO empresas (id, nome) VALUES
        (tenant_a, 'TESTE-CONTATO Empresa A'),
        (tenant_b, 'TESTE-CONTATO Empresa B');

    INSERT INTO clientes (id, empresa_id, nome, documento, cpf_cnpj, telefone) VALUES
        (client_a, tenant_a, 'TESTE-CONTATO Cliente A', 'TESTE-CONTATO-A', 'TESTE-CONTATO-A', '71900000001'),
        (client_b, tenant_b, 'TESTE-CONTATO Cliente B', 'TESTE-CONTATO-B', 'TESTE-CONTATO-B', '71900000002');

    INSERT INTO cliente_contatos (id, empresa_id, cliente_id, nome, email, telefone) VALUES
        (contact_a, tenant_a, client_a, 'TESTE-CONTATO Responsável A', 'a@teste-contato.local', '71911111111'),
        (contact_b, tenant_b, client_b, 'TESTE-CONTATO Responsável B', 'b@teste-contato.local', '71922222222');

    IF (SELECT COUNT(*) FROM cliente_contatos WHERE cliente_id = client_a AND empresa_id = tenant_a AND ativo) <> 1 THEN
        RAISE EXCEPTION 'CRUD de contato ativo falhou';
    END IF;

    IF (SELECT COUNT(*) FROM cliente_contatos WHERE cliente_id = client_b AND empresa_id = tenant_a) <> 0 THEN
        RAISE EXCEPTION 'isolamento por empresa falhou';
    END IF;

    INSERT INTO equipamentos (
        id, empresa_id, serial_number, marca, modelo, tipo, data_entrada,
        defeito_relatado, cliente_id, responsavel_contato_id,
        responsavel_nome, responsavel_email, responsavel_telefone, status
    ) VALUES (
        equipment_a, tenant_a, 'TESTE-CONTATO-SN-A', 'TESTE', 'Modelo', 'IMPRESSORA', '2026-09-10',
        'TESTE-CONTATO defeito', client_a, contact_a,
        'TESTE-CONTATO Responsável A', 'a@teste-contato.local', '71911111111', 'AGUARDANDO_APROVACAO'
    );

    INSERT INTO verificacoes (
        id, empresa_id, equipamento_id, tecnico_nome, problema_relatado,
        forma_pagamento_codigo, forma_pagamento_detalhe
    ) VALUES (
        verification_a, tenant_a, equipment_a, 'TESTE-CONTATO Técnico', 'TESTE-CONTATO problema', NULL, NULL
    );

    SELECT responsavel_nome, responsavel_email, responsavel_telefone
      INTO snapshot_name, snapshot_email, snapshot_phone
      FROM equipamentos WHERE id = equipment_a;

    UPDATE cliente_contatos
       SET nome = 'TESTE-CONTATO Responsável Editado', email = 'editado@teste-contato.local'
     WHERE id = contact_a;
    UPDATE cliente_contatos SET ativo = false WHERE id = contact_a;

    IF EXISTS (
        SELECT 1 FROM equipamentos
         WHERE id = equipment_a
           AND (responsavel_nome, responsavel_email, responsavel_telefone)
               IS DISTINCT FROM (snapshot_name, snapshot_email, snapshot_phone)
    ) THEN
        RAISE EXCEPTION 'snapshot do equipamento foi reescrito';
    END IF;

    BEGIN
        INSERT INTO cliente_contatos (empresa_id, cliente_id, nome)
        VALUES (tenant_a, client_a, '  ');
        RAISE EXCEPTION 'nome em branco foi aceito';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO verificacoes (empresa_id, equipamento_id, tecnico_nome, problema_relatado, forma_pagamento_codigo)
        VALUES (tenant_a, equipment_a, 'TESTE-CONTATO Técnico', 'TESTE-CONTATO problema', 'CODIGO_INVALIDO');
        RAISE EXCEPTION 'código de pagamento inválido foi aceito';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO verificacoes (empresa_id, equipamento_id, tecnico_nome, problema_relatado, forma_pagamento_codigo)
        VALUES (tenant_a, equipment_a, 'TESTE-CONTATO Técnico', 'TESTE-CONTATO problema', 'OUTRO');
        RAISE EXCEPTION 'OUTRO sem detalhe foi aceito';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    -- Simula uma tentativa de aprovação que falha depois das duas escritas.
    -- O bloco PL/pgSQL cria um sub-savepoint implícito e desfaz ambas.
    BEGIN
        UPDATE verificacoes
           SET forma_pagamento_codigo = 'PIX', forma_pagamento_detalhe = NULL
         WHERE id = verification_a;
        UPDATE equipamentos SET status = 'APROVADO' WHERE id = equipment_a;
        UPDATE verificacoes SET forma_pagamento_codigo = 'CODIGO_INVALIDO' WHERE id = verification_a;
        RAISE EXCEPTION 'rollback de aprovação não foi acionado';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    SELECT status INTO current_status FROM equipamentos WHERE id = equipment_a;
    SELECT forma_pagamento_codigo INTO current_payment FROM verificacoes WHERE id = verification_a;
    IF current_status <> 'AGUARDANDO_APROVACAO' OR current_payment IS NOT NULL THEN
        RAISE EXCEPTION 'rollback transacional deixou atualização parcial';
    END IF;

    IF NOT (
        SELECT c.relrowsecurity
          FROM pg_class c
         WHERE c.oid = 'cliente_contatos'::regclass
    ) THEN
        RAISE EXCEPTION 'RLS de cliente_contatos não está habilitado';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'cliente_contatos'
           AND policyname = 'anon_filter_empresa_id'
           AND qual ILIKE '%empresa_id%'
           AND with_check ILIKE '%empresa_id%'
    ) THEN
        RAISE EXCEPTION 'política RLS tenant-safe de cliente_contatos ausente';
    END IF;
END $$;

ROLLBACK;
