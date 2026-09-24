-- Fixtures sintéticas locais. As mutações e tentativas são revertidas ao fim.
BEGIN;

INSERT INTO public.security_profiles (
    id, empresa_id, nome, role, permissions, ativo, is_default
) VALUES (
    'a0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000001',
    'AO-AUTH-TEST-EMPLOYEE-A', 'TECNICO', '[]', true, false
);

INSERT INTO public.company_user_identities (
    auth_user_id, empresa_id, profile_id
) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000012'
);

INSERT INTO auth.sessions (id, user_id) VALUES
    ('a0000000-0000-4000-8000-000000000092', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ('b0000000-0000-4000-8000-000000000092', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

INSERT INTO public.equipamentos (
    id, empresa_id, serial_number, marca, modelo, tipo, data_entrada, status, defeito_relatado
) VALUES
    ('a0000000-0000-4000-8000-000000000041', 'a0000000-0000-4000-8000-000000000001', 'AUTHZ-A', 'Marca', 'Modelo', 'Impressora', '2026-01-01', 'RECEBIDO', 'Falha sintética'),
    ('a0000000-0000-4000-8000-000000000042', 'a0000000-0000-4000-8000-000000000001', 'AUTHZ-A-2', 'Marca', 'Modelo', 'Impressora', '2026-01-01', 'AGUARDANDO_APROVACAO', 'Falha sintética'),
    ('b0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000001', 'AUTHZ-B', 'Marca', 'Modelo', 'Impressora', '2026-01-01', 'VERIFICADO', 'Falha sintética');

INSERT INTO public.produtos (
    id, empresa_id, codigo, nome, categoria, quantidade_estoque,
    quantidade_minima, quantidade_maxima, unidade_medida, preco_custo, preco_venda
) VALUES (
    'a0000000-0000-4000-8000-000000000051',
    'a0000000-0000-4000-8000-000000000001',
    'AUTHZ-A', 'Produto Authz A', 'Peças', 4, 0, 20, 'UN', 10, 20
);

INSERT INTO public.verificacoes (
    id, empresa_id, equipamento_id, tecnico_nome, problema_relatado
) VALUES (
    'a0000000-0000-4000-8000-000000000061',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000041',
    'Técnico de teste', 'Verificação sintética de autorização'
);

SELECT set_config(
    'autoos.test.authz_user_a',
    jsonb_build_object(
        'sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'session_id', 'a0000000-0000-4000-8000-000000000092',
        'app_metadata', jsonb_build_object(
            'company_id', 'b0000000-0000-4000-8000-000000000001',
            'profile_id', 'b0000000-0000-4000-8000-000000000011',
            'profile_role', 'ADMIN'
        ),
        'user_metadata', jsonb_build_object(
            'company_id', 'b0000000-0000-4000-8000-000000000001',
            'profile_id', 'b0000000-0000-4000-8000-000000000011',
            'profile_role', 'ADMIN'
        )
    )::text,
    true
);
SELECT set_config(
    'autoos.test.authz_admin_b',
    jsonb_build_object(
        'sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'session_id', 'b0000000-0000-4000-8000-000000000092',
        'app_metadata', jsonb_build_object(
            'company_id', 'b0000000-0000-4000-8000-000000000001',
            'profile_id', 'b0000000-0000-4000-8000-000000000011'
        )
    )::text,
    true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.authz_user_a'), true);

DO $$
DECLARE
    affected integer;
BEGIN
    IF public.current_company_id() IS DISTINCT FROM
       'a0000000-0000-4000-8000-000000000001'::uuid THEN
        RAISE EXCEPTION 'forged tenant/profile metadata changed the authoritative identity';
    END IF;
    IF (SELECT count(*) FROM public.equipamentos) <> 2 THEN
        RAISE EXCEPTION 'employee did not receive exactly its own tenant equipment';
    END IF;

    BEGIN
        UPDATE public.security_profiles
           SET role = 'ADMIN', permissions = '["FINANCIAL_ACTIONS"]'
         WHERE id = 'a0000000-0000-4000-8000-000000000012';
        RAISE EXCEPTION 'employee escalated its security profile';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    -- Um fluxo operacional permitido continua sem exigir permissão financeira.
    UPDATE public.equipamentos SET status = 'EM_VERIFICACAO'
     WHERE id = 'a0000000-0000-4000-8000-000000000041';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
        RAISE EXCEPTION 'regular operational status transition was blocked';
    END IF;

    BEGIN
        UPDATE public.equipamentos SET valor_orcamento = 125
         WHERE id = 'a0000000-0000-4000-8000-000000000041';
        RAISE EXCEPTION 'financial equipment mutation bypassed server authorization';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        UPDATE public.equipamentos SET status = 'APROVADO'
         WHERE id = 'a0000000-0000-4000-8000-000000000042';
        RAISE EXCEPTION 'financial status transition bypassed server authorization';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        UPDATE public.equipamentos SET status = 'RECEBIDO'
         WHERE id = 'a0000000-0000-4000-8000-000000000041';
        RAISE EXCEPTION 'status correction bypassed server authorization';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        UPDATE public.equipamentos SET status = 'ENTREGUE'
         WHERE id = 'a0000000-0000-4000-8000-000000000041';
        RAISE EXCEPTION 'invalid equipment transition was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN
        NULL;
    END;

    BEGIN
        UPDATE public.verificacoes SET custo_total = 80
         WHERE id = 'a0000000-0000-4000-8000-000000000061';
        RAISE EXCEPTION 'verification cost mutation bypassed server authorization';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        UPDATE public.produtos SET quantidade_estoque = 12
         WHERE id = 'a0000000-0000-4000-8000-000000000051';
        RAISE EXCEPTION 'stock mutation bypassed server authorization';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.movimentacoes_estoque (
            empresa_id, produto_id, tipo, quantidade, origem
        ) VALUES (
            'a0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000051', 'ENTRADA', 1, 'Teste'
        );
        RAISE EXCEPTION 'stock movement bypassed server authorization';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.gastos_fixos (empresa_id, nome, valor, categoria)
        VALUES ('a0000000-0000-4000-8000-000000000001', 'Despesa de teste', 25, 'Teste');
        RAISE EXCEPTION 'expense mutation bypassed server authorization';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.gastos_variaveis (empresa_id, descricao, valor, data, categoria)
        VALUES ('a0000000-0000-4000-8000-000000000001', 'Despesa variável de teste', 12, CURRENT_DATE, 'Teste');
        RAISE EXCEPTION 'variable expense mutation bypassed server authorization';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.security_audit_log (
            empresa_id, event_type, profile_id, profile_name, details,
            success, auth_user_id
        ) VALUES (
            'a0000000-0000-4000-8000-000000000001', 'FORGED',
            'b0000000-0000-4000-8000-000000000011', 'Forged', 'actor spoof', true,
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
        );
        RAISE EXCEPTION 'client forged an audit actor';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        UPDATE public.security_audit_log SET success = false;
        RAISE EXCEPTION 'client changed an audit event';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        DELETE FROM public.security_audit_log;
        RAISE EXCEPTION 'client deleted an audit event';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;

RESET ROLE;
UPDATE public.security_profiles
   SET permissions = '["FINANCIAL_ACTIONS", "STOCK_CONTROL"]'
 WHERE id = 'a0000000-0000-4000-8000-000000000012';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.authz_user_a'), true);

DO $$
DECLARE
    actor_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    tenant_id uuid := 'a0000000-0000-4000-8000-000000000001';
BEGIN
    UPDATE public.equipamentos SET valor_orcamento = 125
     WHERE id = 'a0000000-0000-4000-8000-000000000041';
    PERFORM public.saas_update_equipment_status(
        'a0000000-0000-4000-8000-000000000041',
        (SELECT atualizado_em FROM public.equipamentos
         WHERE id = 'a0000000-0000-4000-8000-000000000041'),
        'RECEBIDO', NULL, NULL, NULL, 'Correção autorizada no contrato de testes'
    );
    UPDATE public.verificacoes SET custo_total = 80
     WHERE id = 'a0000000-0000-4000-8000-000000000061';
    UPDATE public.produtos SET quantidade_estoque = 7
     WHERE id = 'a0000000-0000-4000-8000-000000000051';
    INSERT INTO public.movimentacoes_estoque (
        empresa_id, produto_id, tipo, quantidade, origem
    ) VALUES (
        tenant_id, 'a0000000-0000-4000-8000-000000000051', 'ENTRADA', 3, 'Teste autorizado'
    );
    INSERT INTO public.gastos_fixos (empresa_id, nome, valor, categoria)
    VALUES (tenant_id, 'Despesa autorizada de teste', 25, 'Teste');
    INSERT INTO public.gastos_variaveis (empresa_id, descricao, valor, data, categoria)
    VALUES (tenant_id, 'Despesa variável autorizada de teste', 12, CURRENT_DATE, 'Teste');

    IF (SELECT adjusted_by_profile_id FROM public.verificacoes
        WHERE id = 'a0000000-0000-4000-8000-000000000061')
       IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000012'::uuid THEN
        RAISE EXCEPTION 'verification adjustment actor was not assigned by the server';
    END IF;
    IF (SELECT count(*) FROM public.security_audit_log
        WHERE auth_user_id = actor_id
          AND empresa_id = tenant_id
          AND profile_id = 'a0000000-0000-4000-8000-000000000012'
          AND success IS TRUE
          AND occurred_at IS NOT NULL
          AND event_type = 'SAAS_SENSITIVE_MUTATION') <> 7 THEN
        RAISE EXCEPTION 'successful sensitive mutations lack authoritative audit records';
    END IF;

    BEGIN
        UPDATE public.equipamentos
           SET empresa_id = 'b0000000-0000-4000-8000-000000000001', valor_orcamento = 200
         WHERE id = 'a0000000-0000-4000-8000-000000000041';
        RAISE EXCEPTION 'authorized employee reassigned a row to another tenant';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    IF (SELECT empresa_id FROM public.equipamentos
        WHERE id = 'a0000000-0000-4000-8000-000000000041')
       IS DISTINCT FROM tenant_id THEN
        RAISE EXCEPTION 'failed forged-tenant update changed the stored tenant';
    END IF;
END;
$$;

-- JWT continua igual: retirar a permissão do vínculo/perfil atual tem efeito
-- imediato, sem refresh nem confiança nas claims ADMIN adulteradas.
RESET ROLE;
UPDATE public.security_profiles
   SET permissions = '[]'
 WHERE id = 'a0000000-0000-4000-8000-000000000012';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.authz_user_a'), true);
DO $$
BEGIN
    BEGIN
        UPDATE public.equipamentos SET valor_orcamento = 150
         WHERE id = 'a0000000-0000-4000-8000-000000000041';
        RAISE EXCEPTION 'removed permission remained effective with the old JWT';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;

RESET ROLE;
UPDATE public.security_profiles SET ativo = false
 WHERE id = 'a0000000-0000-4000-8000-000000000012';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.authz_user_a'), true);
DO $$
DECLARE affected integer;
BEGIN
    UPDATE public.equipamentos SET valor_orcamento = 150
     WHERE id = 'a0000000-0000-4000-8000-000000000041';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'inactive profile remained able to mutate financial data';
    END IF;
END;
$$;

RESET ROLE;
UPDATE public.security_profiles SET ativo = true
 WHERE id = 'a0000000-0000-4000-8000-000000000012';
UPDATE public.security_profiles SET permissions = '["FINANCIAL_ACTIONS"]'
 WHERE id = 'a0000000-0000-4000-8000-000000000012';
UPDATE public.company_user_identities
   SET ativo = false, suspended_at = clock_timestamp(), updated_at = clock_timestamp()
 WHERE auth_user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.authz_user_a'), true);
DO $$
DECLARE affected integer;
BEGIN
    UPDATE public.equipamentos SET valor_orcamento = 150
     WHERE id = 'a0000000-0000-4000-8000-000000000041';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN
        RAISE EXCEPTION 'revoked identity remained able to mutate with the old JWT';
    END IF;
END;
$$;

-- O ADMIN legado da empresa B mantém autorização enquanto seu vínculo e seu
-- perfil ADMIN ativos persistirem; isso não eleva o perfil funcionário da A.
SELECT set_config('request.jwt.claims', current_setting('autoos.test.authz_admin_b'), true);
DO $$
BEGIN
    UPDATE public.equipamentos SET status = 'AGUARDANDO_APROVACAO'
     WHERE id = 'b0000000-0000-4000-8000-000000000041';
    IF (SELECT count(*) FROM public.security_audit_log
        WHERE auth_user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
          AND empresa_id = 'b0000000-0000-4000-8000-000000000001'
          AND event_type = 'SAAS_SENSITIVE_MUTATION'
          AND success IS TRUE) <> 1 THEN
        RAISE EXCEPTION 'active legacy ADMIN lost access or audit used a client-supplied actor';
    END IF;
END;
$$;

RESET ROLE;
ROLLBACK;
