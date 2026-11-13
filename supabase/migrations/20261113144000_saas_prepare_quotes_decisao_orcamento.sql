-- Porte SaaS da decisão 10/11/2026: Orçamentos (PREPARE_QUOTES) também aprova,
-- reprova, reabre e renova. Aditivo: FINANCIAL_ACTIONS continua valendo.
-- Não reescreve migration já aplicada. Não aplicar neste PR.

CREATE OR REPLACE FUNCTION private.saas_has_quote_or_financial_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT private.saas_has_permission('FINANCIAL_ACTIONS')
        OR private.saas_has_permission('PREPARE_QUOTES');
$$;

CREATE OR REPLACE FUNCTION private.saas_quote_core_covers_financial(
    p_table_name text,
    p_operation text,
    p_old jsonb,
    p_new jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    from_status text;
    to_status text;
    equipment_status text;
    equipment_id uuid;
BEGIN
    IF p_table_name = 'equipamentos' AND p_operation = 'UPDATE' THEN
        IF COALESCE(p_old ->> 'valor_final', '') IS DISTINCT FROM COALESCE(p_new ->> 'valor_final', '')
           OR COALESCE(p_old ->> 'preco_compra', '') IS DISTINCT FROM COALESCE(p_new ->> 'preco_compra', '')
           OR COALESCE(p_old ->> 'preco_venda', '') IS DISTINCT FROM COALESCE(p_new ->> 'preco_venda', '') THEN
            RETURN false;
        END IF;
        from_status := upper(COALESCE(p_old ->> 'status', ''));
        to_status := upper(COALESCE(p_new ->> 'status', ''));
        IF from_status IS NOT DISTINCT FROM to_status THEN
            RETURN from_status = ANY (ARRAY[
                'RECEBIDO', 'EM_VERIFICACAO', 'VERIFICADO',
                'AGUARDANDO_APROVACAO', 'ORCAMENTO_VENCIDO'
            ]);
        END IF;
        RETURN (from_status, to_status) IN (
            ('VERIFICADO', 'AGUARDANDO_APROVACAO'),
            ('AGUARDANDO_APROVACAO', 'APROVADO'),
            ('AGUARDANDO_APROVACAO', 'REPROVADO'),
            ('REPROVADO', 'AGUARDANDO_APROVACAO'),
            ('ORCAMENTO_VENCIDO', 'AGUARDANDO_APROVACAO')
        );
    END IF;

    IF p_table_name = 'verificacoes' AND p_operation IN ('INSERT', 'UPDATE') THEN
        BEGIN
            equipment_id := NULLIF(COALESCE(p_new ->> 'equipamento_id', p_old ->> 'equipamento_id'), '')::uuid;
        EXCEPTION WHEN invalid_text_representation THEN
            RETURN false;
        END;
        IF equipment_id IS NULL THEN
            RETURN false;
        END IF;
        SELECT upper(COALESCE(item.status, ''))
          INTO equipment_status
          FROM public.equipamentos AS item
         WHERE item.id = equipment_id
           AND item.empresa_id = public.current_company_id();
        RETURN equipment_status = ANY (ARRAY[
            'RECEBIDO', 'EM_VERIFICACAO', 'VERIFICADO',
            'AGUARDANDO_APROVACAO', 'ORCAMENTO_VENCIDO'
        ]);
    END IF;

    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION private.saas_has_quote_or_financial_permission()
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.saas_quote_core_covers_financial(text, text, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.enforce_saas_sensitive_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
    new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
    required_permissions text[];
    required_permission text;
    actor record;
    all_permissions_granted boolean := true;
    authorized_rpc text := NULLIF(BTRIM(current_setting('autoos.authorized_budget_rpc', true)), '');
BEGIN
    IF private.saas_is_trusted_maintenance_session() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_TABLE_NAME = 'equipamentos' AND TG_OP = 'UPDATE'
       AND upper(COALESCE(old_row ->> 'status', '')) IS DISTINCT FROM
           upper(COALESCE(new_row ->> 'status', ''))
       AND NOT private.saas_is_regular_equipment_transition(
           old_row ->> 'status', new_row ->> 'status'
       )
       AND NOT private.saas_is_equipment_status_correction(
           old_row ->> 'status', new_row ->> 'status'
       ) THEN
        RAISE EXCEPTION 'Invalid equipment status transition'
            USING ERRCODE = '22023';
    END IF;

    IF TG_TABLE_NAME = 'movimentacoes_estoque' AND TG_OP IN ('UPDATE', 'DELETE') THEN
        RAISE LOG 'AUTOOS_SAAS_AUTHZ_DENIED auth_user_id=% tenant_id=% action=movimentacoes_estoque.% result=denied at=%',
            (SELECT identity.auth_user_id FROM private.current_saas_session_identity() AS identity LIMIT 1),
            (SELECT identity.empresa_id FROM private.current_saas_session_identity() AS identity LIMIT 1),
            TG_OP,
            clock_timestamp();
        RAISE EXCEPTION 'Stock movements are immutable; record a compensating movement instead'
            USING ERRCODE = '55000';
    END IF;

    required_permissions := private.saas_required_permissions(
        TG_TABLE_NAME, TG_OP, old_row, new_row
    );

    SELECT identity.auth_user_id, identity.empresa_id, identity.profile_id, profile.nome
      INTO actor
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;

    IF authorized_rpc IS NULL THEN
        IF cardinality(required_permissions) = 0 THEN
            RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
        END IF;
        FOREACH required_permission IN ARRAY required_permissions LOOP
            IF required_permission = 'FINANCIAL_ACTIONS'
               AND private.saas_has_permission('PREPARE_QUOTES')
               AND private.saas_quote_core_covers_financial(
                   TG_TABLE_NAME, TG_OP, old_row, new_row
               ) THEN
                NULL;
            ELSIF NOT private.saas_has_permission(required_permission) THEN
                all_permissions_granted := false;
                EXIT;
            END IF;
        END LOOP;
        IF NOT all_permissions_granted THEN
            RAISE LOG 'AUTOOS_SAAS_AUTHZ_DENIED auth_user_id=% tenant_id=% action=%.% required=% result=denied at=%',
                actor.auth_user_id,
                actor.empresa_id,
                TG_TABLE_NAME,
                TG_OP,
                required_permissions,
                clock_timestamp();
            RAISE EXCEPTION 'Not authorized for this SaaS operation; required permission: %',
                array_to_string(required_permissions, ', ')
                USING ERRCODE = '42501';
        END IF;
    ELSIF cardinality(required_permissions) = 0 THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_TABLE_NAME = 'verificacoes' AND TG_OP IN ('INSERT', 'UPDATE')
       AND 'FINANCIAL_ACTIONS' = ANY (required_permissions) THEN
        NEW.adjusted_at := clock_timestamp();
        NEW.adjusted_by_profile_id := actor.profile_id;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_approve_equipment_quote_with_stock(
    p_equipment_id uuid,
    p_expected_updated_em timestamp without time zone,
    p_payment_code text,
    p_payment_detail text,
    p_services_approved text[] DEFAULT NULL
)
RETURNS public.equipamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_equipment public.equipamentos%ROWTYPE;
    v_verification public.verificacoes%ROWTYPE;
    v_actor text;
    v_services jsonb;
    v_original_parts jsonb;
    v_service record;
    v_part record;
    v_service_id text;
    v_service_ids text[] := ARRAY[]::text[];
    v_approved_ids text[] := ARRAY[]::text[];
    v_product_ids uuid[] := ARRAY[]::uuid[];
    v_product_id uuid;
    v_quantity numeric;
    v_unit_price numeric;
    v_service_value numeric;
    v_previous_approved integer;
    v_previously_debited integer;
    v_new_approved integer;
    v_to_debit integer;
    v_available integer;
    v_debit integer;
    v_service_count integer;
    v_approved_count integer;
    v_total numeric := 0;
    v_services_total numeric := 0;
    v_parts_total numeric := 0;
    v_total_to_save numeric;
    v_all_approved boolean;
    v_approved boolean;
    v_services_to_save jsonb := '[]'::jsonb;
    v_parts_to_save jsonb := '[]'::jsonb;
    v_normalized_service jsonb;
    v_new_status text;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active SaaS identity is required' USING ERRCODE = '42501';
    END IF;
    IF NOT private.saas_has_quote_or_financial_permission() THEN
        RAISE EXCEPTION 'Financial or quote-preparation permission is required' USING ERRCODE = '42501';
    END IF;
    IF p_payment_code IS NULL OR p_payment_code NOT IN (
        'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO',
        'DINHEIRO', 'TRANSFERENCIA', 'A_COMBINAR', 'OUTRO'
    ) OR (p_payment_code = 'OUTRO' AND NULLIF(btrim(p_payment_detail), '') IS NULL) THEN
        RAISE EXCEPTION 'Payment method is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT profile.nome
      INTO v_actor
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Active SaaS profile is required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_equipment
      FROM public.equipamentos AS item
     WHERE item.id = p_equipment_id AND item.empresa_id = v_tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    IF v_equipment.atualizado_em IS DISTINCT FROM p_expected_updated_em THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;
    IF upper(coalesce(v_equipment.status, '')) <> 'AGUARDANDO_APROVACAO' THEN
        RAISE EXCEPTION 'Only quotes awaiting approval can be approved' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_verification
      FROM public.verificacoes AS item
     WHERE item.equipamento_id = v_equipment.id AND item.empresa_id = v_tenant_id
     ORDER BY item.data_inicio DESC NULLS LAST, item.id DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'A technical verification is required before approval' USING ERRCODE = 'P0002';
    END IF;

    BEGIN
        v_services := coalesce(v_verification.servicos_necessarios::jsonb, '[]'::jsonb);
        v_original_parts := coalesce(v_verification.pecas_necessarias::jsonb, '[]'::jsonb);
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Quote services or parts are invalid' USING ERRCODE = '22023';
    END;
    IF jsonb_typeof(v_services) IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_original_parts) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Quote services and parts must be arrays' USING ERRCODE = '22023';
    END IF;

    FOR v_service IN
        SELECT item.value, item.ordinality
          FROM jsonb_array_elements(v_services) WITH ORDINALITY AS item(value, ordinality)
    LOOP
        IF jsonb_typeof(v_service.value) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'A quote service is invalid' USING ERRCODE = '22023';
        END IF;
        v_service_id := coalesce(nullif(v_service.value ->> 'id', ''), 'legacy:' || (v_service.ordinality - 1)::text);
        IF v_service_id = ANY(v_service_ids) THEN
            RAISE EXCEPTION 'Quote service identifiers must be unique' USING ERRCODE = '22023';
        END IF;
        v_service_ids := array_append(v_service_ids, v_service_id);
        IF jsonb_typeof(v_service.value -> 'valor') IS DISTINCT FROM 'number'
           OR (v_service.value ->> 'valor')::numeric < 0 THEN
            RAISE EXCEPTION 'Quote service value is invalid' USING ERRCODE = '22023';
        END IF;
        IF v_service.value ? 'pecas'
           AND jsonb_typeof(v_service.value -> 'pecas') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Quote service parts must be an array' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    v_service_count := cardinality(v_service_ids);

    -- Cancel pending quantities only for services removed from the quote.
    -- Pending quantities that still belong to an approved service remain
    -- pending until an operator confirms them from the equipment order.
    UPDATE public.orcamento_consumos AS consumption
       SET quantidade_aprovada = consumption.quantidade_baixada
     WHERE consumption.verificacao_id = v_verification.id
       AND consumption.empresa_id = v_tenant_id
       AND consumption.servico_id <> ALL(v_service_ids);

    IF p_services_approved IS NULL THEN
        v_approved_ids := v_service_ids;
    ELSE
        FOREACH v_service_id IN ARRAY p_services_approved LOOP
            IF v_service_id IS NULL OR btrim(v_service_id) = ''
               OR NOT (v_service_id = ANY(v_service_ids))
               OR v_service_id = ANY(v_approved_ids) THEN
                RAISE EXCEPTION 'Approved services contain a duplicate or unknown identifier' USING ERRCODE = '22023';
            END IF;
            v_approved_ids := array_append(v_approved_ids, v_service_id);
        END LOOP;
    END IF;
    v_approved_count := cardinality(v_approved_ids);
    v_all_approved := v_approved_count = v_service_count;
    v_approved := p_services_approved IS NULL OR v_approved_count > 0;
    v_new_status := CASE WHEN v_approved THEN 'APROVADO' ELSE 'REPROVADO' END;

    -- Lock all affected products in the same order to avoid cross-OS deadlocks.
    FOR v_service IN
        SELECT item.value, item.ordinality
          FROM jsonb_array_elements(v_services) WITH ORDINALITY AS item(value, ordinality)
    LOOP
        v_service_id := coalesce(nullif(v_service.value ->> 'id', ''), 'legacy:' || (v_service.ordinality - 1)::text);
        IF v_service_id = ANY(v_approved_ids) THEN
            FOR v_part IN
                SELECT item.value
                  FROM jsonb_array_elements(coalesce(v_service.value -> 'pecas', '[]'::jsonb)) AS item(value)
            LOOP
                IF jsonb_typeof(v_part.value) IS DISTINCT FROM 'object'
                   OR coalesce(v_part.value ->> 'produto_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   OR jsonb_typeof(v_part.value -> 'quantidade') IS DISTINCT FROM 'number'
                   OR jsonb_typeof(v_part.value -> 'valor_unitario') IS DISTINCT FROM 'number' THEN
                    RAISE EXCEPTION 'A linked product or quantity is invalid' USING ERRCODE = '22023';
                END IF;
                v_quantity := (v_part.value ->> 'quantidade')::numeric;
                v_unit_price := (v_part.value ->> 'valor_unitario')::numeric;
                IF v_quantity <= 0 OR trunc(v_quantity) <> v_quantity OR v_quantity > 2147483647
                   OR v_unit_price < 0 OR v_unit_price::text = 'NaN' THEN
                    RAISE EXCEPTION 'A linked product quantity or value is invalid' USING ERRCODE = '22023';
                END IF;
                v_product_ids := array_append(v_product_ids, (v_part.value ->> 'produto_id')::uuid);
            END LOOP;
        END IF;
    END LOOP;

    SELECT coalesce(array_agg(DISTINCT item.id ORDER BY item.id), ARRAY[]::uuid[])
      INTO v_product_ids
      FROM unnest(v_product_ids) AS item(id);
    IF cardinality(v_product_ids) > 0 AND NOT private.saas_has_permission('STOCK_CONTROL') THEN
        RAISE EXCEPTION 'Stock control permission is required for linked parts' USING ERRCODE = '42501';
    END IF;
    IF cardinality(v_product_ids) > 0 THEN
        PERFORM product.id
          FROM public.produtos AS product
         WHERE product.id = ANY(v_product_ids)
           AND product.empresa_id = v_tenant_id
           AND product.ativo IS TRUE
         ORDER BY product.id
         FOR UPDATE;
        IF (SELECT count(*) FROM public.produtos AS product
             WHERE product.id = ANY(v_product_ids)
               AND product.empresa_id = v_tenant_id
               AND product.ativo IS TRUE) <> cardinality(v_product_ids) THEN
            RAISE EXCEPTION 'A linked product is unavailable for the active company' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF v_approved AND v_approved_count > 0 AND EXISTS (
        SELECT 1
          FROM jsonb_array_elements(v_original_parts) AS saved(value)
         WHERE coalesce(saved.value ->> 'id', '') = ''
            OR NOT EXISTS (
                SELECT 1
                  FROM jsonb_array_elements(v_services) WITH ORDINALITY AS service(value, ordinality)
                  CROSS JOIN LATERAL jsonb_array_elements(coalesce(service.value -> 'pecas', '[]'::jsonb)) AS part(value)
                 WHERE concat(
                     coalesce(nullif(service.value ->> 'id', ''), 'legacy:' || (service.ordinality - 1)::text),
                     ':', part.value ->> 'produto_id'
                 ) = saved.value ->> 'id'
            )
    ) THEN
        RAISE EXCEPTION 'Legacy parts must be linked to a service before approval' USING ERRCODE = '22023';
    END IF;

    FOR v_service IN
        SELECT item.value, item.ordinality
          FROM jsonb_array_elements(v_services) WITH ORDINALITY AS item(value, ordinality)
    LOOP
        v_service_id := coalesce(nullif(v_service.value ->> 'id', ''), 'legacy:' || (v_service.ordinality - 1)::text);
        INSERT INTO public.orcamento_servicos_decisao (verificacao_id, servico_id, empresa_id, decisao)
        VALUES (
            v_verification.id,
            v_service_id,
            v_tenant_id,
            CASE WHEN v_service_id = ANY(v_approved_ids) THEN 'APROVADO' ELSE 'REPROVADO' END
        )
        ON CONFLICT (verificacao_id, servico_id) DO UPDATE
           SET decisao = EXCLUDED.decisao, decidido_em = clock_timestamp();

        IF v_service_id <> ALL(v_approved_ids) THEN
            UPDATE public.orcamento_consumos AS consumption
               SET quantidade_aprovada = consumption.quantidade_baixada
             WHERE consumption.verificacao_id = v_verification.id
               AND consumption.servico_id = v_service_id
               AND consumption.empresa_id = v_tenant_id;
            CONTINUE;
        END IF;

        v_normalized_service := jsonb_set(v_service.value, '{id}', to_jsonb(v_service_id), true);
        v_services_to_save := v_services_to_save || jsonb_build_array(v_normalized_service);
        v_service_value := (v_service.value ->> 'valor')::numeric;
        v_total := v_total + v_service_value;
        v_services_total := v_services_total + v_service_value;

        -- If an approved service no longer uses a previously linked product,
        -- close only that product's old pending quantity without refunding
        -- stock that was already consumed.
        UPDATE public.orcamento_consumos AS consumption
           SET quantidade_aprovada = consumption.quantidade_baixada
         WHERE consumption.verificacao_id = v_verification.id
           AND consumption.servico_id = v_service_id
           AND consumption.empresa_id = v_tenant_id
           AND NOT EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(coalesce(v_service.value -> 'pecas', '[]'::jsonb)) AS part(value)
                WHERE part.value ->> 'produto_id' = consumption.produto_id::text
           );

        FOR v_part IN
            SELECT (item.value ->> 'produto_id')::uuid AS produto_id,
                   sum((item.value ->> 'quantidade')::numeric)::integer AS quantidade,
                   min(item.value ->> 'nome') AS nome,
                   sum((item.value ->> 'quantidade')::numeric * (item.value ->> 'valor_unitario')::numeric) AS total_peca,
                   min((item.value ->> 'valor_unitario')::numeric) AS valor_unitario
              FROM jsonb_array_elements(coalesce(v_service.value -> 'pecas', '[]'::jsonb)) AS item(value)
             GROUP BY (item.value ->> 'produto_id')::uuid
             ORDER BY (item.value ->> 'produto_id')::uuid
        LOOP
            v_total := v_total + v_part.total_peca;
            v_parts_total := v_parts_total + v_part.total_peca;
            v_parts_to_save := v_parts_to_save || jsonb_build_array(jsonb_build_object(
                'id', v_service_id || ':' || v_part.produto_id::text,
                'produto_id', v_part.produto_id,
                'servico_id', v_service_id,
                'nome', v_part.nome,
                'quantidade', v_part.quantidade,
                'valorUnitario', v_part.valor_unitario,
                'valorTotal', v_part.total_peca
            ));

            SELECT consumption.quantidade_aprovada, consumption.quantidade_baixada
              INTO v_previous_approved, v_previously_debited
              FROM public.orcamento_consumos AS consumption
             WHERE consumption.verificacao_id = v_verification.id
               AND consumption.servico_id = v_service_id
               AND consumption.produto_id = v_part.produto_id
             FOR UPDATE;
            IF NOT FOUND THEN
                v_previous_approved := 0;
                v_previously_debited := 0;
            END IF;
            v_new_approved := greatest(v_part.quantidade, v_previously_debited);
            INSERT INTO public.orcamento_consumos (
                verificacao_id, servico_id, produto_id, empresa_id,
                quantidade_aprovada, quantidade_baixada
            ) VALUES (
                v_verification.id, v_service_id, v_part.produto_id, v_tenant_id,
                v_new_approved, coalesce(v_previously_debited, 0)
            )
            ON CONFLICT (verificacao_id, servico_id, produto_id) DO UPDATE
               SET quantidade_aprovada = EXCLUDED.quantidade_aprovada;

            v_to_debit := greatest(v_new_approved - v_previous_approved, 0);
            IF v_to_debit > 0 THEN
                SELECT greatest(coalesce(product.quantidade_estoque, 0), 0)
                  INTO v_available
                  FROM public.produtos AS product
                 WHERE product.id = v_part.produto_id
                   AND product.empresa_id = v_tenant_id
                   AND product.ativo IS TRUE
                 FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'A linked product is unavailable for the active company' USING ERRCODE = 'P0002';
                END IF;
                v_debit := least(v_available, v_to_debit);
                IF v_debit > 0 THEN
                    UPDATE public.produtos AS product
                       SET quantidade_estoque = coalesce(product.quantidade_estoque, 0) - v_debit,
                           atualizado_em = clock_timestamp()
                     WHERE product.id = v_part.produto_id AND product.empresa_id = v_tenant_id;
                    INSERT INTO public.movimentacoes_estoque (
                        empresa_id, produto_id, tipo, quantidade, origem, referencia, usuario, data_hora
                    ) VALUES (
                        v_tenant_id, v_part.produto_id, 'SAIDA', v_debit, 'MANUTENCAO',
                        'verificacao:' || v_verification.id::text || ';servico:' || v_service_id,
                        v_actor, clock_timestamp()
                    );
                    UPDATE public.orcamento_consumos AS consumption
                       SET quantidade_baixada = consumption.quantidade_baixada + v_debit
                     WHERE consumption.verificacao_id = v_verification.id
                       AND consumption.servico_id = v_service_id
                       AND consumption.produto_id = v_part.produto_id
                       AND consumption.empresa_id = v_tenant_id;
                END IF;
            END IF;
        END LOOP;
    END LOOP;

    IF v_approved THEN
        v_total_to_save := CASE
            WHEN v_all_approved THEN coalesce(v_verification.custo_total, v_total)
            ELSE v_total
        END;
        IF v_total_to_save < 0 OR v_total_to_save::text = 'NaN' THEN
            RAISE EXCEPTION 'Approved quote total is invalid' USING ERRCODE = '22023';
        END IF;
    ELSE
        v_services_to_save := v_services;
        v_parts_to_save := v_original_parts;
        v_total_to_save := coalesce(v_verification.custo_total, 0);
    END IF;

    UPDATE public.verificacoes AS item
       SET forma_pagamento_codigo = p_payment_code,
           forma_pagamento_detalhe = CASE WHEN p_payment_code = 'OUTRO' THEN nullif(btrim(p_payment_detail), '') ELSE NULL END,
           servicos_orcamento_original = coalesce(item.servicos_orcamento_original, v_services),
           pecas_orcamento_original = coalesce(item.pecas_orcamento_original, v_original_parts),
           valor_orcamento_original = coalesce(item.valor_orcamento_original, item.custo_total),
           servicos_necessarios = v_services_to_save::text,
           pecas_necessarias = v_parts_to_save::text,
           custo_estimado_mao_obra = CASE WHEN v_approved AND NOT v_all_approved THEN round(v_services_total, 2) ELSE item.custo_estimado_mao_obra END,
           custo_estimado_pecas = CASE WHEN v_approved AND NOT v_all_approved THEN round(v_parts_total, 2) ELSE item.custo_estimado_pecas END,
           custo_total = v_total_to_save
     WHERE item.id = v_verification.id
       AND item.equipamento_id = v_equipment.id
       AND item.empresa_id = v_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verification changed during quote approval' USING ERRCODE = '40001';
    END IF;

    UPDATE public.equipamentos AS item
       SET status = v_new_status,
           valor_orcamento = v_total_to_save,
           data_aprovacao = CASE WHEN v_approved THEN current_date::text ELSE item.data_aprovacao END,
           data_reprovacao = CASE WHEN NOT v_approved THEN current_date::text ELSE item.data_reprovacao END,
           atualizado_em = clock_timestamp()
     WHERE item.id = v_equipment.id AND item.empresa_id = v_tenant_id
     RETURNING * INTO v_equipment;
    RETURN v_equipment;
END;
$$;

ALTER FUNCTION public.saas_approve_equipment_quote_with_stock(uuid, timestamp, text, text, text[])
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_approve_equipment_quote_with_stock(uuid, timestamp, text, text, text[])
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.saas_approve_equipment_quote_with_stock(uuid, timestamp, text, text, text[])
    TO authenticated;
