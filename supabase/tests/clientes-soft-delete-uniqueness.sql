-- Executar no staging: a transação inteira é revertida ao fim.
BEGIN;

DO $$
DECLARE
    tenant_a uuid := gen_random_uuid();
    tenant_b uuid := gen_random_uuid();
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'clientes'
           AND indexname = 'ux_clientes_empresa_documento_ativo'
           AND indexdef LIKE '%ativo = true%'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'clientes'
           AND indexname = 'ux_clientes_empresa_cpf_cnpj_ativo'
           AND indexdef LIKE '%ativo = true%'
    ) THEN
        RAISE EXCEPTION 'Índices únicos parciais de clientes não encontrados';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.clientes'::regclass
           AND conname IN ('uq_clientes_empresa_documento', 'uq_clientes_empresa_cpf_cnpj')
    ) THEN
        RAISE EXCEPTION 'Constraints antigas ainda bloqueiam clientes inativos';
    END IF;

    INSERT INTO public.empresas (id, nome) VALUES
        (tenant_a, 'Teste temporário AO-CLI-003 A'),
        (tenant_b, 'Teste temporário AO-CLI-003 B');

    INSERT INTO public.clientes (empresa_id, nome, documento, cpf_cnpj)
        VALUES (tenant_a, 'Cliente antigo', 'AO-CLI-003-DOC', 'AO-CLI-003-CPF');
    UPDATE public.clientes SET ativo = false
     WHERE empresa_id = tenant_a AND documento = 'AO-CLI-003-DOC';
    INSERT INTO public.clientes (empresa_id, nome, documento, cpf_cnpj)
        VALUES (tenant_a, 'Novo cadastro', 'AO-CLI-003-DOC', 'AO-CLI-003-CPF');

    BEGIN
        INSERT INTO public.clientes (empresa_id, nome, documento, cpf_cnpj)
            VALUES (tenant_a, 'Documento repetido', 'AO-CLI-003-DOC', 'AO-CLI-003-CPF-OTHER');
        RAISE EXCEPTION 'Documento ativo duplicado foi aceito';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.clientes (empresa_id, nome, documento, cpf_cnpj)
            VALUES (tenant_a, 'CPF repetido', 'AO-CLI-003-DOC-OTHER', 'AO-CLI-003-CPF');
        RAISE EXCEPTION 'CPF ativo duplicado foi aceito';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;

    INSERT INTO public.clientes (empresa_id, nome, documento, cpf_cnpj)
        VALUES (tenant_b, 'Outro tenant', 'AO-CLI-003-DOC', 'AO-CLI-003-CPF');
END;
$$;

ROLLBACK;
