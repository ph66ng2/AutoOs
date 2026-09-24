-- Contrato do fluxo SaaS de verificação/orçamento/status.
-- Executar apenas em banco local descartável com as migrations e rls.sql aplicadas.
-- Fixtures derivam dos dois tenants Auth sintéticos do bootstrap local.

BEGIN;

INSERT INTO public.security_profiles (id, empresa_id, nome, role, permissions, ativo)
VALUES
    ('a0000000-0000-4000-8000-000000000072', 'a0000000-0000-4000-8000-000000000001', 'AO-EQP-003-FINANCEIRO', 'TECNICO', '["FINANCIAL_ACTIONS"]', true),
    ('b0000000-0000-4000-8000-000000000072', 'b0000000-0000-4000-8000-000000000001', 'AO-EQP-003-SEM-FINANCEIRO', 'TECNICO', '[]', true);

INSERT INTO public.company_user_identities (auth_user_id, empresa_id, profile_id)
VALUES
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000072'),
    ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000072');

INSERT INTO auth.sessions (id, user_id) VALUES
    ('a0000000-0000-4000-8000-000000000073', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    ('b0000000-0000-4000-8000-000000000073', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

INSERT INTO public.equipamentos (
    id, empresa_id, serial_number, marca, modelo, tipo, data_entrada,
    defeito_relatado, status, atualizado_em
) VALUES
    ('a0000000-0000-4000-8000-000000000074', 'a0000000-0000-4000-8000-000000000001', 'AO-EQP-003-A', 'TESTE', 'Modelo A', 'IMPRESSORA', '2026-09-24', 'Falha sintética', 'EM_VERIFICACAO', '2026-09-24 10:00:00'),
    ('b0000000-0000-4000-8000-000000000074', 'b0000000-0000-4000-8000-000000000001', 'AO-EQP-003-B', 'TESTE', 'Modelo B', 'IMPRESSORA', '2026-09-24', 'Falha sintética', 'AGUARDANDO_APROVACAO', '2026-09-24 10:00:00');

INSERT INTO public.verificacoes (
    id, empresa_id, equipamento_id, tecnico_nome, problema_relatado,
    concluida, servicos_necessarios, pecas_necessarias
) VALUES (
    'a0000000-0000-4000-8000-000000000075',
    'b0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000074',
    'Técnico sintético', 'Verificação de teste', true, '[]', '[]'
);

SELECT set_config(
    'autoos.test.eqp003_user_a',
    jsonb_build_object(
        'sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'session_id', 'a0000000-0000-4000-8000-000000000073',
        'app_metadata', jsonb_build_object('company_id', 'b0000000-0000-4000-8000-000000000001', 'profile_role', 'ADMIN'),
        'user_metadata', jsonb_build_object('company_id', 'b0000000-0000-4000-8000-000000000001', 'profile_role', 'ADMIN')
    )::text,
    true
);
SELECT set_config(
    'autoos.test.eqp003_user_b',
    jsonb_build_object(
        'sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'session_id', 'b0000000-0000-4000-8000-000000000073'
    )::text,
    true
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.eqp003_user_a'), true);

DO $$
DECLARE
    stale_token timestamp := '2026-09-24 10:00:00';
    finalized jsonb;
    quoted jsonb;
    changed public.equipamentos%ROWTYPE;
    audit_reason text;
BEGIN
    IF public.current_company_id() IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000001'::uuid THEN
        RAISE EXCEPTION 'forged JWT metadata changed the authoritative tenant';
    END IF;
    IF (SELECT count(*) FROM public.equipamentos WHERE id = 'b0000000-0000-4000-8000-000000000074') <> 0 THEN
        RAISE EXCEPTION 'RLS exposed another tenant equipment';
    END IF;

    finalized := public.saas_finalize_equipment_verification(
        'a0000000-0000-4000-8000-000000000074', stale_token,
        jsonb_build_object(
            'tecnico_nome', 'Ivan', 'problema_relatado', 'Falha sintética',
            'diagnostico', 'Cabeça térmica',
            'itens_verificados', jsonb_build_array(jsonb_build_object('id', '1', 'nome', 'Teste de impressão', 'verificado', true)),
            'servicos_necessarios', jsonb_build_array(jsonb_build_object('id', '1', 'descricao', 'Limpeza', 'valor', 35)),
            'pecas_necessarias', jsonb_build_array(jsonb_build_object('id', '2', 'nome', 'Rolo', 'quantidade', 2, 'valorUnitario', 20, 'valorTotal', 40)),
            'custo_estimado_mao_obra', 35, 'custo_estimado_pecas', 40,
            'custo_total', 75, 'tempo_estimado', 3, 'observacoes', 'Teste'
        ),
        '2026-09-29'
    );
    IF finalized #>> '{equipment,status}' <> 'AGUARDANDO_APROVACAO'
       OR finalized #>> '{equipment,empresa_id}' <> 'a0000000-0000-4000-8000-000000000001'
       OR finalized #>> '{verification,custo_total}' <> '75' THEN
        RAISE EXCEPTION 'verification finalization did not atomically persist tenant, quote, and status';
    END IF;

    BEGIN
        PERFORM public.saas_update_equipment_status(
            'a0000000-0000-4000-8000-000000000074', stale_token,
            'REPROVADO', NULL, NULL, NULL, NULL
        );
        RAISE EXCEPTION 'stale equipment version was accepted';
    EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
    END;

    quoted := public.saas_update_equipment_quote(
        'a0000000-0000-4000-8000-000000000074',
        (finalized #>> '{equipment,atualizado_em}')::timestamp,
        jsonb_build_array(jsonb_build_object('id', '1', 'descricao', 'Limpeza', 'valor', 35)),
        jsonb_build_array(jsonb_build_object('id', '2', 'nome', 'Rolo', 'quantidade', 2, 'valorUnitario', 20, 'valorTotal', 40)),
        75, 'Ajuste sintético', NULL, NULL, NULL, NULL, NULL
    );
    IF quoted #>> '{equipment,status}' <> 'AGUARDANDO_APROVACAO'
       OR quoted #>> '{equipment,valor_orcamento}' <> '75'
       OR quoted #>> '{verification,observacoes}' <> 'Ajuste sintético' THEN
        RAISE EXCEPTION 'quote adjustment did not atomically preserve status and update the quote';
    END IF;

    BEGIN
        PERFORM public.saas_update_equipment_quote(
            'a0000000-0000-4000-8000-000000000074',
            (quoted #>> '{equipment,atualizado_em}')::timestamp,
            jsonb_build_array(jsonb_build_object('descricao', '', 'valor', -1)),
            '[]'::jsonb, 0, NULL, NULL, NULL, NULL, NULL, NULL
        );
        RAISE EXCEPTION 'invalid quote service data was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    SELECT * INTO changed FROM public.saas_approve_equipment_quote(
        'a0000000-0000-4000-8000-000000000074',
        (quoted #>> '{equipment,atualizado_em}')::timestamp,
        'PIX', NULL
    );
    IF changed.status <> 'APROVADO' THEN
        RAISE EXCEPTION 'approval did not advance the equipment status';
    END IF;

    SELECT * INTO changed FROM public.saas_update_equipment_status(
        changed.id, changed.atualizado_em, 'AGUARDANDO_APROVACAO', NULL, NULL, NULL,
        'Correção sintética de status'
    );
    SELECT details INTO audit_reason
      FROM public.security_audit_log
     WHERE event_type = 'EQUIPMENT_STATUS_CORRECTED'
       AND details LIKE '%Correção sintética de status%'
     ORDER BY occurred_at DESC LIMIT 1;
    IF audit_reason IS NULL OR changed.status <> 'AGUARDANDO_APROVACAO' THEN
        RAISE EXCEPTION 'status correction reason was not audited';
    END IF;

    BEGIN
        PERFORM public.saas_update_equipment_status(
            changed.id, changed.atualizado_em, 'ENTREGUE', NULL, NULL, NULL, NULL
        );
        RAISE EXCEPTION 'invalid status transition was accepted';
    EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
    END;

    BEGIN
        PERFORM public.saas_update_equipment_status(
            'b0000000-0000-4000-8000-000000000074', changed.atualizado_em,
            'REPROVADO', NULL, NULL, NULL, NULL
        );
        RAISE EXCEPTION 'cross-tenant status mutation was accepted';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

SELECT set_config('request.jwt.claims', current_setting('autoos.test.eqp003_user_b'), true);
DO $$
BEGIN
    BEGIN
        PERFORM public.saas_approve_equipment_quote(
            'b0000000-0000-4000-8000-000000000074', '2026-09-24 10:00:00', 'PIX', NULL
        );
        RAISE EXCEPTION 'inactive financial permission was not enforced';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$$;

RESET ROLE;
UPDATE public.security_profiles SET ativo = false
 WHERE id = 'b0000000-0000-4000-8000-000000000072';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.eqp003_user_b'), true);
DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'inactive operational profile retained tenant authority';
    END IF;
END;
$$;

SELECT set_config(
    'request.jwt.claims',
    jsonb_set(current_setting('autoos.test.eqp003_user_a')::jsonb, '{session_id}', '"c0000000-0000-4000-8000-000000000073"'::jsonb)::text,
    true
);
DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL
       OR (SELECT count(*) FROM public.equipamentos) <> 0 THEN
        RAISE EXCEPTION 'an old/revoked session retained tenant access';
    END IF;
END;
$$;

RESET ROLE;

DO $$
BEGIN
    IF NOT has_function_privilege('authenticated', 'public.saas_finalize_equipment_verification(uuid,timestamp,jsonb,date)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.saas_finalize_equipment_verification(uuid,timestamp,jsonb,date)', 'EXECUTE')
       OR (SELECT prosecdef FROM pg_proc WHERE oid = 'public.saas_finalize_equipment_verification(uuid,timestamp,jsonb,date)'::regprocedure) THEN
        RAISE EXCEPTION 'workflow RPC grants/security-invoker contract is incorrect';
    END IF;
END;
$$;

ROLLBACK;
