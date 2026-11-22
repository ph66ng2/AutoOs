-- Regras operacionais SaaS: categorias de estoque e consumo de peças por
-- serviço aprovado. Nunca editar migrations já aplicadas.
--
-- Rollback: interrompa as operações do SaaS antes de remover funções, policies,
-- tabelas e colunas criadas abaixo. A normalização de categoria é intencional e
-- não recupera o texto legado exato; restaure-o somente de backup. Movimentos e
-- baixas de estoque são registros operacionais: nunca os apague para reverter
-- esta migration; corrija saldo com movimento compensatório ou migration aditiva.

UPDATE public.produtos
   SET categoria = CASE
       WHEN upper(btrim(categoria)) = 'ROLO' AND codigo LIKE 'ETQ-%' THEN 'ETIQUETA'
       WHEN upper(btrim(categoria)) IN ('TONER', 'CARTUCHO', 'RIBBON') THEN 'RIBBON'
       WHEN upper(btrim(categoria)) IN ('PEÇA', 'PECA', 'FUSOR', 'CILINDRO', 'ROLO') THEN 'PEÇA'
       WHEN upper(btrim(categoria)) = 'IMPRESSORA' THEN 'IMPRESSORA'
       WHEN upper(btrim(categoria)) = 'ETIQUETA' THEN 'ETIQUETA'
       ELSE 'OUTROS'
   END
 WHERE categoria NOT IN ('IMPRESSORA', 'PEÇA', 'ETIQUETA', 'RIBBON', 'OUTROS');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.produtos'::regclass
           AND conname = 'chk_produtos_categoria_operacional'
    ) THEN
        ALTER TABLE public.produtos
            ADD CONSTRAINT chk_produtos_categoria_operacional
            CHECK (categoria IN ('IMPRESSORA', 'PEÇA', 'ETIQUETA', 'RIBBON', 'OUTROS'));
    END IF;
END;
$$;

ALTER TABLE public.verificacoes
    ADD COLUMN IF NOT EXISTS servicos_orcamento_original jsonb,
    ADD COLUMN IF NOT EXISTS pecas_orcamento_original jsonb,
    ADD COLUMN IF NOT EXISTS valor_orcamento_original numeric;

CREATE UNIQUE INDEX IF NOT EXISTS uq_verificacoes_empresa_id
    ON public.verificacoes (empresa_id, id);

CREATE TABLE IF NOT EXISTS public.orcamento_servicos_decisao (
    verificacao_id uuid NOT NULL,
    servico_id text NOT NULL,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    decisao text NOT NULL CHECK (decisao IN ('APROVADO', 'REPROVADO')),
    decidido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (verificacao_id, servico_id),
    CONSTRAINT fk_orcamento_decisao_verificacao_empresa
        FOREIGN KEY (empresa_id, verificacao_id)
        REFERENCES public.verificacoes (empresa_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.orcamento_consumos (
    verificacao_id uuid NOT NULL,
    servico_id text NOT NULL,
    produto_id uuid NOT NULL,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    quantidade_aprovada integer NOT NULL CHECK (quantidade_aprovada >= 0),
    quantidade_baixada integer NOT NULL DEFAULT 0 CHECK (quantidade_baixada >= 0),
    PRIMARY KEY (verificacao_id, servico_id, produto_id),
    CONSTRAINT fk_orcamento_consumos_verificacao_empresa
        FOREIGN KEY (empresa_id, verificacao_id)
        REFERENCES public.verificacoes (empresa_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_orcamento_consumos_produto_empresa
        FOREIGN KEY (empresa_id, produto_id)
        REFERENCES public.produtos (empresa_id, id) ON DELETE RESTRICT,
    CHECK (quantidade_baixada <= quantidade_aprovada)
);

CREATE INDEX IF NOT EXISTS idx_orcamento_decisao_empresa
    ON public.orcamento_servicos_decisao (empresa_id, verificacao_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_consumos_pendentes
    ON public.orcamento_consumos (empresa_id, verificacao_id, produto_id)
    WHERE quantidade_baixada < quantidade_aprovada;

ALTER TABLE public.orcamento_servicos_decisao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_consumos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orcamento_servicos_decisao, public.orcamento_consumos FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS orcamento_decisao_empresa ON public.orcamento_servicos_decisao;
CREATE POLICY orcamento_decisao_empresa ON public.orcamento_servicos_decisao
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT public.current_company_id()));
DROP POLICY IF EXISTS orcamento_consumos_empresa ON public.orcamento_consumos;
CREATE POLICY orcamento_consumos_empresa ON public.orcamento_consumos
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT public.current_company_id()));

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
    IF NOT private.saas_has_permission('FINANCIAL_ACTIONS') THEN
        RAISE EXCEPTION 'Financial actions permission is required' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.saas_list_equipment_quote_consumption(p_equipment_id uuid)
RETURNS TABLE (
    verificacao_id uuid,
    servico_id text,
    produto_id uuid,
    nome text,
    quantidade_aprovada integer,
    quantidade_baixada integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL
       OR NOT private.saas_has_permission('STOCK_CONTROL') THEN
        RAISE EXCEPTION 'Stock control permission is required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.equipamentos AS equipment
         WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
    ) THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT consumption.verificacao_id, consumption.servico_id, consumption.produto_id,
           product.nome, consumption.quantidade_aprovada, consumption.quantidade_baixada
      FROM public.orcamento_consumos AS consumption
      JOIN public.verificacoes AS verification
        ON verification.id = consumption.verificacao_id
       AND verification.empresa_id = consumption.empresa_id
      JOIN public.equipamentos AS equipment
        ON equipment.id = verification.equipamento_id
       AND equipment.empresa_id = consumption.empresa_id
      JOIN public.produtos AS product
        ON product.id = consumption.produto_id
       AND product.empresa_id = consumption.empresa_id
     WHERE equipment.id = p_equipment_id
       AND consumption.empresa_id = v_tenant_id
     ORDER BY consumption.servico_id, product.nome, product.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_consume_pending_equipment_parts(p_equipment_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_equipment public.equipamentos%ROWTYPE;
    v_actor text;
    v_pending record;
    v_available integer;
    v_debit integer;
    v_total bigint := 0;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL
       OR NOT private.saas_has_permission('STOCK_CONTROL') THEN
        RAISE EXCEPTION 'Stock control permission is required' USING ERRCODE = '42501';
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
      FROM public.equipamentos AS equipment
     WHERE equipment.id = p_equipment_id
       AND equipment.empresa_id = v_tenant_id
       AND equipment.status IN ('APROVADO', 'EM_MANUTENCAO', 'AGUARDANDO_PECA', 'PRONTO')
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'OS is not approved or is unavailable for this company' USING ERRCODE = '22023';
    END IF;

    FOR v_pending IN
        SELECT consumption.verificacao_id, consumption.servico_id, consumption.produto_id,
               consumption.quantidade_aprovada - consumption.quantidade_baixada AS restante
          FROM public.orcamento_consumos AS consumption
          JOIN public.orcamento_servicos_decisao AS decision
            ON decision.verificacao_id = consumption.verificacao_id
           AND decision.servico_id = consumption.servico_id
           AND decision.empresa_id = consumption.empresa_id
           AND decision.decisao = 'APROVADO'
          JOIN public.verificacoes AS verification
            ON verification.id = consumption.verificacao_id
           AND verification.empresa_id = consumption.empresa_id
         WHERE verification.equipamento_id = p_equipment_id
           AND consumption.empresa_id = v_tenant_id
           AND consumption.quantidade_aprovada > consumption.quantidade_baixada
         ORDER BY consumption.produto_id, consumption.servico_id
         FOR UPDATE OF consumption
    LOOP
        SELECT greatest(coalesce(product.quantidade_estoque, 0), 0)
          INTO v_available
          FROM public.produtos AS product
         WHERE product.id = v_pending.produto_id
           AND product.empresa_id = v_tenant_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A pending product is unavailable for the active company' USING ERRCODE = 'P0002';
        END IF;
        v_debit := least(v_available, v_pending.restante);
        IF v_debit > 0 THEN
            UPDATE public.produtos AS product
               SET quantidade_estoque = coalesce(product.quantidade_estoque, 0) - v_debit,
                   atualizado_em = clock_timestamp()
             WHERE product.id = v_pending.produto_id AND product.empresa_id = v_tenant_id;
            INSERT INTO public.movimentacoes_estoque (
                empresa_id, produto_id, tipo, quantidade, origem, referencia, usuario, data_hora
            ) VALUES (
                v_tenant_id, v_pending.produto_id, 'SAIDA', v_debit, 'MANUTENCAO',
                'verificacao:' || v_pending.verificacao_id::text || ';servico:' || v_pending.servico_id,
                v_actor, clock_timestamp()
            );
            UPDATE public.orcamento_consumos AS consumption
               SET quantidade_baixada = consumption.quantidade_baixada + v_debit
             WHERE consumption.verificacao_id = v_pending.verificacao_id
               AND consumption.servico_id = v_pending.servico_id
               AND consumption.produto_id = v_pending.produto_id
               AND consumption.empresa_id = v_tenant_id;
            v_total := v_total + v_debit;
        END IF;
    END LOOP;
    RETURN v_total;
END;
$$;

ALTER FUNCTION public.saas_list_equipment_quote_consumption(uuid) OWNER TO postgres;
ALTER FUNCTION public.saas_consume_pending_equipment_parts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_list_equipment_quote_consumption(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.saas_consume_pending_equipment_parts(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.saas_list_equipment_quote_consumption(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_consume_pending_equipment_parts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_register_counter_intake_verification(
    p_equipment_id uuid,
    p_technician text,
    p_reported_problem text,
    p_diagnosis text,
    p_observations text
)
RETURNS public.verificacoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_equipment public.equipamentos%ROWTYPE;
    v_verification public.verificacoes%ROWTYPE;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active SaaS identity is required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM private.current_saas_session_identity() AS identity
          JOIN public.security_profiles AS profile
            ON profile.id = identity.profile_id
           AND profile.empresa_id = identity.empresa_id
           AND profile.ativo IS TRUE
         WHERE identity.auth_user_id = (SELECT auth.uid())
           AND identity.empresa_id = v_tenant_id
    ) THEN
        RAISE EXCEPTION 'An active SaaS operational profile is required' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_technician), '') IS NULL OR NULLIF(btrim(p_reported_problem), '') IS NULL THEN
        RAISE EXCEPTION 'Technician and reported problem are required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_equipment
      FROM public.equipamentos AS equipment
     WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
     FOR UPDATE;
    IF NOT FOUND OR upper(coalesce(v_equipment.status, '')) <> 'RECEBIDO' THEN
        RAISE EXCEPTION 'Equipment is unavailable for intake verification' USING ERRCODE = '42501';
    END IF;

    -- Repeated requests after a network timeout reuse the initial verification.
    SELECT * INTO v_verification
      FROM public.verificacoes AS verification
     WHERE verification.equipamento_id = p_equipment_id
       AND verification.empresa_id = v_tenant_id
     ORDER BY verification.data_inicio DESC NULLS LAST, verification.id DESC
     LIMIT 1
     FOR UPDATE;
    IF FOUND THEN
        RETURN v_verification;
    END IF;

    INSERT INTO public.verificacoes (
        empresa_id, equipamento_id, tecnico_nome, problema_relatado, diagnostico,
        itens_verificados, servicos_necessarios, pecas_necessarias,
        custo_estimado_mao_obra, custo_estimado_pecas, custo_total,
        tempo_estimado, concluida, observacoes
    ) VALUES (
        v_tenant_id, p_equipment_id, btrim(p_technician), btrim(p_reported_problem),
        nullif(btrim(p_diagnosis), ''), '[]', '[]', '[]', NULL, NULL, NULL,
        NULL, false, nullif(btrim(p_observations), '')
    ) RETURNING * INTO v_verification;
    RETURN v_verification;
END;
$$;

ALTER FUNCTION public.saas_register_counter_intake_verification(uuid, text, text, text, text)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_register_counter_intake_verification(uuid, text, text, text, text)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.saas_register_counter_intake_verification(uuid, text, text, text, text)
    TO authenticated;
