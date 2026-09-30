CREATE OR REPLACE FUNCTION private.saas_required_permissions(
    p_table_name text,
    p_operation text,
    p_old jsonb,
    p_new jsonb
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    required_permissions text[] := ARRAY[]::text[];
    status_changed boolean := COALESCE(p_old ->> 'status', '') IS DISTINCT FROM
                              COALESCE(p_new ->> 'status', '');
BEGIN
    CASE p_table_name
        WHEN 'equipamentos' THEN
            IF p_operation = 'DELETE' THEN
                required_permissions := ARRAY['DELETE_RECORDS'];
                IF p_old ->> 'preco_compra' IS NOT NULL
                   OR p_old ->> 'preco_venda' IS NOT NULL
                   OR p_old ->> 'valor_orcamento' IS NOT NULL
                   OR p_old ->> 'valor_final' IS NOT NULL
                   OR private.saas_is_financial_equipment_status(p_old ->> 'status') THEN
                    required_permissions := array_append(required_permissions, 'FINANCIAL_ACTIONS');
                END IF;
            ELSIF p_operation = 'INSERT' THEN
                IF p_new ->> 'preco_compra' IS NOT NULL
                   OR p_new ->> 'preco_venda' IS NOT NULL
                   OR p_new ->> 'valor_orcamento' IS NOT NULL
                   OR p_new ->> 'prazo_aprovacao' IS NOT NULL
                   OR p_new ->> 'valor_final' IS NOT NULL
                   OR p_new ->> 'data_aprovacao' IS NOT NULL
                   OR p_new ->> 'data_reprovacao' IS NOT NULL
                   OR private.saas_is_financial_equipment_status(p_new ->> 'status') THEN
                    required_permissions := ARRAY['FINANCIAL_ACTIONS'];
                END IF;
            ELSIF p_operation = 'UPDATE' THEN
                IF p_old ->> 'preco_compra' IS DISTINCT FROM p_new ->> 'preco_compra'
                   OR p_old ->> 'preco_venda' IS DISTINCT FROM p_new ->> 'preco_venda'
                   OR p_old ->> 'valor_orcamento' IS DISTINCT FROM p_new ->> 'valor_orcamento'
                   OR p_old ->> 'prazo_aprovacao' IS DISTINCT FROM p_new ->> 'prazo_aprovacao'
                   OR p_old ->> 'valor_final' IS DISTINCT FROM p_new ->> 'valor_final'
                   OR p_old ->> 'data_aprovacao' IS DISTINCT FROM p_new ->> 'data_aprovacao'
                   OR p_old ->> 'data_reprovacao' IS DISTINCT FROM p_new ->> 'data_reprovacao'
                   OR (status_changed AND (
                        private.saas_is_financial_equipment_status(p_new ->> 'status')
                        OR private.saas_is_equipment_status_correction(
                            p_old ->> 'status', p_new ->> 'status'
                        )
                   )) THEN
                    required_permissions := ARRAY['FINANCIAL_ACTIONS'];
                END IF;
            END IF;

        WHEN 'verificacoes' THEN
            IF p_operation = 'DELETE' THEN
                required_permissions := ARRAY['DELETE_RECORDS'];
                IF p_old ->> 'custo_estimado_mao_obra' IS NOT NULL
                   OR p_old ->> 'custo_estimado_pecas' IS NOT NULL
                   OR p_old ->> 'custo_total' IS NOT NULL
                   OR p_old ->> 'forma_pagamento_codigo' IS NOT NULL
                   OR p_old ->> 'forma_pagamento_detalhe' IS NOT NULL THEN
                    required_permissions := array_append(required_permissions, 'FINANCIAL_ACTIONS');
                END IF;
            ELSIF p_operation = 'INSERT' THEN
                IF p_new ->> 'custo_estimado_mao_obra' IS NOT NULL
                   OR p_new ->> 'custo_estimado_pecas' IS NOT NULL
                   OR p_new ->> 'custo_total' IS NOT NULL
                   OR p_new ->> 'forma_pagamento_codigo' IS NOT NULL
                   OR p_new ->> 'forma_pagamento_detalhe' IS NOT NULL
                   OR p_new ->> 'adjusted_at' IS NOT NULL
                   OR p_new ->> 'adjusted_by_profile_id' IS NOT NULL THEN
                    required_permissions := ARRAY['FINANCIAL_ACTIONS'];
                END IF;
            ELSIF p_operation = 'UPDATE' THEN
                IF p_old ->> 'custo_estimado_mao_obra' IS DISTINCT FROM p_new ->> 'custo_estimado_mao_obra'
                   OR p_old ->> 'custo_estimado_pecas' IS DISTINCT FROM p_new ->> 'custo_estimado_pecas'
                   OR p_old ->> 'custo_total' IS DISTINCT FROM p_new ->> 'custo_total'
                   OR p_old ->> 'forma_pagamento_codigo' IS DISTINCT FROM p_new ->> 'forma_pagamento_codigo'
                   OR p_old ->> 'forma_pagamento_detalhe' IS DISTINCT FROM p_new ->> 'forma_pagamento_detalhe'
                   OR p_old ->> 'adjusted_at' IS DISTINCT FROM p_new ->> 'adjusted_at'
                   OR p_old ->> 'adjusted_by_profile_id' IS DISTINCT FROM p_new ->> 'adjusted_by_profile_id' THEN
                    required_permissions := ARRAY['FINANCIAL_ACTIONS'];
                END IF;
            END IF;

        WHEN 'produtos' THEN
            IF p_operation = 'DELETE' THEN
                required_permissions := ARRAY['DELETE_RECORDS'];
            ELSIF p_operation = 'UPDATE'
               AND p_old ->> 'ativo' IS DISTINCT FROM p_new ->> 'ativo'
               AND p_new ->> 'ativo' = 'false' THEN
                required_permissions := ARRAY['DELETE_RECORDS'];
                IF (p_old - 'ativo' - 'atualizado_em') IS DISTINCT FROM
                   (p_new - 'ativo' - 'atualizado_em') THEN
                    required_permissions := array_append(required_permissions, 'STOCK_CONTROL');
                END IF;
            ELSE
                required_permissions := ARRAY['STOCK_CONTROL'];
            END IF;

        WHEN 'movimentacoes_estoque' THEN
            IF p_operation = 'INSERT' THEN
                required_permissions := ARRAY['STOCK_CONTROL'];
            END IF;

        WHEN 'gastos_fixos', 'gastos_variaveis' THEN
            required_permissions := ARRAY['FINANCIAL_ACTIONS'];

        ELSE
            NULL;
    END CASE;

    RETURN required_permissions;
END;
$$;

REVOKE ALL ON FUNCTION private.saas_required_permissions(text, text, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.enforce_saas_product_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.quantidade_estoque IS DISTINCT FROM NEW.quantidade_estoque
       AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Product stock must be changed through a stock movement'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_saas_product_stock_movement()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS saas_product_stock_movement_guard ON public.produtos;
CREATE TRIGGER saas_product_stock_movement_guard
    BEFORE UPDATE OF quantidade_estoque ON public.produtos
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_product_stock_movement();

CREATE OR REPLACE FUNCTION private.normalize_saas_product_quantity_bounds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF COALESCE(NEW.quantidade_maxima, 0) < COALESCE(NEW.quantidade_minima, 0) THEN
        NEW.quantidade_maxima := COALESCE(NEW.quantidade_minima, 0);
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.normalize_saas_product_quantity_bounds()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS saas_product_quantity_bounds ON public.produtos;
CREATE TRIGGER saas_product_quantity_bounds
    BEFORE INSERT OR UPDATE OF quantidade_minima, quantidade_maxima ON public.produtos
    FOR EACH ROW EXECUTE FUNCTION private.normalize_saas_product_quantity_bounds();

CREATE INDEX IF NOT EXISTS idx_produtos_empresa_categoria_nome_ativo
    ON public.produtos (empresa_id, categoria, nome, id)
    WHERE ativo IS TRUE;
CREATE INDEX IF NOT EXISTS idx_produtos_empresa_nome_ativo
    ON public.produtos (empresa_id, nome, id)
    WHERE ativo IS TRUE;

CREATE OR REPLACE VIEW public.produtos_estoque_baixo
WITH (security_invoker = true)
AS
SELECT *
  FROM public.produtos
 WHERE ativo IS TRUE
   AND COALESCE(quantidade_estoque, 0) < COALESCE(quantidade_minima, 0);

REVOKE ALL ON public.produtos_estoque_baixo FROM PUBLIC, anon;
GRANT SELECT ON public.produtos_estoque_baixo TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_movimentacao_estoque(
    p_produto_id uuid,
    p_tipo text,
    p_quantidade integer,
    p_origem text,
    p_referencia text DEFAULT NULL
)
RETURNS TABLE (
    movimentacao_id uuid,
    produto_id uuid,
    quantidade_estoque integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_empresa_id uuid;
    v_usuario text;
    v_tipo text := upper(btrim(COALESCE(p_tipo, '')));
    v_origem text := btrim(COALESCE(p_origem, ''));
    v_referencia text := NULLIF(btrim(COALESCE(p_referencia, '')), '');
    v_saldo integer;
    v_novo_saldo integer;
    v_movimentacao_id uuid;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR NOT private.saas_has_permission('STOCK_CONTROL') THEN
        RAISE EXCEPTION 'Stock control permission is required' USING ERRCODE = '42501';
    END IF;

    IF v_tipo NOT IN ('ENTRADA', 'SAIDA') THEN
        RAISE EXCEPTION 'Invalid stock movement type' USING ERRCODE = '22023';
    END IF;
    IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
        RAISE EXCEPTION 'Stock movement quantity must be positive' USING ERRCODE = '22023';
    END IF;
    IF v_origem = '' THEN
        RAISE EXCEPTION 'Stock movement origin is required' USING ERRCODE = '22023';
    END IF;

    SELECT identity.empresa_id, profile.nome
      INTO v_empresa_id, v_usuario
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Active SaaS identity is required' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(product.quantidade_estoque, 0)
      INTO v_saldo
      FROM public.produtos AS product
     WHERE product.id = p_produto_id
       AND product.empresa_id = v_empresa_id
       AND product.ativo IS TRUE
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product is unavailable for this company' USING ERRCODE = 'P0002';
    END IF;

    IF v_tipo = 'SAIDA' AND v_saldo < p_quantidade THEN
        RAISE EXCEPTION 'Insufficient stock for this movement' USING ERRCODE = 'P0001';
    END IF;
    IF v_tipo = 'ENTRADA' AND v_saldo > 2147483647 - p_quantidade THEN
        RAISE EXCEPTION 'Stock exceeds the supported quantity range' USING ERRCODE = '22023';
    END IF;

    v_novo_saldo := CASE
        WHEN v_tipo = 'ENTRADA' THEN v_saldo + p_quantidade
        ELSE v_saldo - p_quantidade
    END;

    UPDATE public.produtos AS product
       SET quantidade_estoque = v_novo_saldo,
           atualizado_em = clock_timestamp()
     WHERE product.id = p_produto_id
       AND product.empresa_id = v_empresa_id
       AND product.ativo IS TRUE;

    INSERT INTO public.movimentacoes_estoque (
        empresa_id, produto_id, tipo, quantidade, origem, referencia, usuario, data_hora
    ) VALUES (
        v_empresa_id, p_produto_id, v_tipo, p_quantidade, v_origem, v_referencia, v_usuario, clock_timestamp()
    )
    RETURNING id INTO v_movimentacao_id;

    RETURN QUERY SELECT v_movimentacao_id, p_produto_id, v_novo_saldo;
END;
$$;

ALTER FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, text)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, text)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, text)
    TO authenticated;

CREATE OR REPLACE FUNCTION private.enforce_saas_atomic_stock_movement_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Stock movements must be created through the atomic stock RPC'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_saas_atomic_stock_movement_insert()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS saas_atomic_stock_movement_insert ON public.movimentacoes_estoque;
CREATE TRIGGER saas_atomic_stock_movement_insert
    BEFORE INSERT ON public.movimentacoes_estoque
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_atomic_stock_movement_insert();
