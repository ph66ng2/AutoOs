-- Contrato aditivo de UUIDs, snapshots e integridade tenant-safe da aba
-- Informações. Execute somente em banco local/disposable após as migrations:
-- psql --set ON_ERROR_STOP=1 --file=supabase/tests/equipment_info_contacts_contract.sql

BEGIN;

DO $$
DECLARE
    tenant_a uuid := '11000000-0000-4000-8000-000000000001';
    tenant_b uuid := '11000000-0000-4000-8000-000000000002';
    client_a uuid := '22000000-0000-4000-8000-000000000001';
    client_a_other uuid := '22000000-0000-4000-8000-000000000002';
    client_b uuid := '22000000-0000-4000-8000-000000000003';
    contact_a uuid := '33000000-0000-4000-8000-000000000001';
    contact_a_other uuid := '33000000-0000-4000-8000-000000000002';
    contact_b uuid := '33000000-0000-4000-8000-000000000003';
    equipment_a uuid := '44000000-0000-4000-8000-000000000001';
    snapshot_name text;
    saved_responsible_id uuid;
    saved_client_id uuid;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'equipamentos'
           AND column_name = 'cliente_documento' AND data_type = 'text'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'equipamentos'
           AND column_name = 'responsavel_contato_id' AND data_type = 'uuid'
    ) THEN
        RAISE EXCEPTION 'Campos UUID/snapshot da aba Informações estão ausentes ou com tipo incorreto';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.equipamentos'::regclass
           AND conname = 'fk_equipamentos_responsavel_cliente_empresa'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.equipamentos'::regclass
           AND conname = 'chk_equipamentos_responsavel_requires_cliente'
    ) THEN
        RAISE EXCEPTION 'FK/validação tenant-safe do contato responsável está ausente';
    END IF;

    INSERT INTO public.empresas (id, nome) VALUES
        (tenant_a, 'TESTE-EQP-INFO Empresa A'),
        (tenant_b, 'TESTE-EQP-INFO Empresa B');

    INSERT INTO public.clientes (id, empresa_id, nome, documento, cpf_cnpj, telefone) VALUES
        (client_a, tenant_a, 'TESTE-EQP-INFO Cliente A', 'TESTE-EQP-INFO-A', 'TESTE-EQP-INFO-A', '71900000001'),
        (client_a_other, tenant_a, 'TESTE-EQP-INFO Cliente A2', 'TESTE-EQP-INFO-A2', 'TESTE-EQP-INFO-A2', '71900000002'),
        (client_b, tenant_b, 'TESTE-EQP-INFO Cliente B', 'TESTE-EQP-INFO-B', 'TESTE-EQP-INFO-B', '71900000003');

    INSERT INTO public.cliente_contatos (id, empresa_id, cliente_id, nome, email, telefone) VALUES
        (contact_a, tenant_a, client_a, 'TESTE-EQP-INFO Contato A', 'a@example.test', '71911111111'),
        (contact_a_other, tenant_a, client_a_other, 'TESTE-EQP-INFO Contato A2', 'a2@example.test', '71911111112'),
        (contact_b, tenant_b, client_b, 'TESTE-EQP-INFO Contato B', 'b@example.test', '71922222222');

    INSERT INTO public.equipamentos (
        id, empresa_id, serial_number, marca, modelo, tipo, data_entrada,
        defeito_relatado, cliente_id, cliente_nome, cliente_documento, responsavel_contato_id,
        responsavel_nome, responsavel_email, responsavel_telefone
    ) VALUES (
        equipment_a, tenant_a, 'TESTE-EQP-INFO-SN-A', 'TESTE', 'Modelo A', 'IMPRESSORA', '2026-09-24',
        'TESTE-EQP-INFO defeito',
        client_a, 'TESTE-EQP-INFO Cliente A', 'TESTE-EQP-INFO-A', contact_a,
        'TESTE-EQP-INFO Contato A', 'a@example.test', '71911111111'
    );

    UPDATE public.cliente_contatos
       SET nome = 'TESTE-EQP-INFO Contato A alterado', email = 'changed@example.test', ativo = false
     WHERE id = contact_a;

    SELECT responsavel_nome, responsavel_contato_id, cliente_id
      INTO snapshot_name, saved_responsible_id, saved_client_id
      FROM public.equipamentos WHERE id = equipment_a;
    IF snapshot_name <> 'TESTE-EQP-INFO Contato A'
       OR saved_responsible_id <> contact_a
       OR saved_client_id <> client_a THEN
        RAISE EXCEPTION 'Atualização/inativação do contato alterou snapshots ou vínculos do equipamento';
    END IF;

    BEGIN
        INSERT INTO public.equipamentos (
            empresa_id, serial_number, marca, modelo, tipo, data_entrada,
            defeito_relatado, cliente_id, responsavel_contato_id
        ) VALUES (
            tenant_a, 'TESTE-EQP-INFO-CROSS-TENANT', 'TESTE', 'Modelo', 'IMPRESSORA', '2026-09-24',
            'TESTE-EQP-INFO defeito',
            client_a, contact_b
        );
        RAISE EXCEPTION 'Equipamento aceitou contato de outro tenant';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.equipamentos (
            empresa_id, serial_number, marca, modelo, tipo, data_entrada,
            defeito_relatado, cliente_id, responsavel_contato_id
        ) VALUES (
            tenant_a, 'TESTE-EQP-INFO-CROSS-CLIENT', 'TESTE', 'Modelo', 'IMPRESSORA', '2026-09-24',
            'TESTE-EQP-INFO defeito',
            client_a, contact_a_other
        );
        RAISE EXCEPTION 'Equipamento aceitou contato de outro cliente do mesmo tenant';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.equipamentos (
            empresa_id, serial_number, marca, modelo, tipo, data_entrada,
            defeito_relatado, responsavel_contato_id
        ) VALUES (
            tenant_a, 'TESTE-EQP-INFO-NO-CLIENT', 'TESTE', 'Modelo', 'IMPRESSORA', '2026-09-24',
            'TESTE-EQP-INFO defeito',
            contact_a
        );
        RAISE EXCEPTION 'Equipamento aceitou contato sem vínculo de cliente';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    DELETE FROM public.cliente_contatos WHERE id = contact_a;
    SELECT responsavel_contato_id, cliente_id, responsavel_nome
      INTO saved_responsible_id, saved_client_id, snapshot_name
      FROM public.equipamentos WHERE id = equipment_a;
    IF saved_responsible_id IS NOT NULL OR saved_client_id <> client_a
       OR snapshot_name <> 'TESTE-EQP-INFO Contato A' THEN
        RAISE EXCEPTION 'Exclusão do contato apagou cliente ou snapshot histórico';
    END IF;
END $$;

ROLLBACK;
