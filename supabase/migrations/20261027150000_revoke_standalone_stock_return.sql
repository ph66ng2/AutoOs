-- Revoga o RPC solto de devolução de estoque: authenticated não pode mais
-- inflar estoque numa OS APROVADO sem reabrir o orçamento.
-- A devolução só ocorre dentro de saas_save_equipment_quote_adjustment /
-- saas_corrigir_decisao_orcamento (GUC autoos.authorized_budget_rpc).
-- Idempotente. Não aplicar em projeto de produção nesta PR.

REVOKE ALL ON FUNCTION public.saas_devolver_pecas_baixadas_orcamento(uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.saas_devolver_pecas_baixadas_orcamento(p_equipment_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_equipment_id IS NULL THEN
        RAISE EXCEPTION 'Stock return is only allowed inside an approved-quote adjustment'
            USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Stock return is only allowed inside an approved-quote adjustment'
        USING ERRCODE = '42501';
END;
$$;

ALTER FUNCTION public.saas_devolver_pecas_baixadas_orcamento(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_devolver_pecas_baixadas_orcamento(uuid)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.saas_return_and_reset_quote_stock(
    p_equipment_id uuid,
    p_return_stock boolean,
    p_actor text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_row record;
    v_total integer := 0;
    v_verification_id uuid;
    v_status text;
    v_authorized text := NULLIF(BTRIM(current_setting('autoos.authorized_budget_rpc', true)), '');
BEGIN
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active company identity is required' USING ERRCODE = '42501';
    END IF;
    IF v_authorized IS DISTINCT FROM 'FINANCIAL_ACTIONS' THEN
        RAISE EXCEPTION 'Stock return is only allowed inside an approved-quote adjustment'
            USING ERRCODE = '42501';
    END IF;

    SELECT upper(COALESCE(equipment.status, ''))
      INTO v_status
      FROM public.equipamentos AS equipment
     WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
     FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    IF v_status NOT IN ('APROVADO', 'AGUARDANDO_APROVACAO') THEN
        RAISE EXCEPTION 'OS is not approved or is unavailable for this company' USING ERRCODE = '22023';
    END IF;

    SELECT verification.id
      INTO v_verification_id
      FROM public.verificacoes AS verification
     WHERE verification.equipamento_id = p_equipment_id
       AND verification.empresa_id = v_tenant_id
     ORDER BY verification.data_inicio DESC NULLS LAST, verification.id DESC
     LIMIT 1
     FOR UPDATE;
    IF v_verification_id IS NULL THEN
        RAISE EXCEPTION 'No verification exists for this equipment' USING ERRCODE = 'P0002';
    END IF;

    IF p_return_stock THEN
        FOR v_row IN
            SELECT consumption.verificacao_id, consumption.servico_id, consumption.produto_id,
                   consumption.quantidade_baixada
              FROM public.orcamento_consumos AS consumption
             WHERE consumption.verificacao_id = v_verification_id
               AND consumption.empresa_id = v_tenant_id
               AND consumption.quantidade_baixada > 0
             ORDER BY consumption.produto_id, consumption.servico_id
             FOR UPDATE
        LOOP
            UPDATE public.produtos AS product
               SET quantidade_estoque = coalesce(product.quantidade_estoque, 0) + v_row.quantidade_baixada,
                   atualizado_em = clock_timestamp()
             WHERE product.id = v_row.produto_id AND product.empresa_id = v_tenant_id;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'A consumed product is unavailable for the active company' USING ERRCODE = 'P0002';
            END IF;
            INSERT INTO public.movimentacoes_estoque (
                empresa_id, produto_id, tipo, quantidade, origem, referencia, usuario, data_hora
            ) VALUES (
                v_tenant_id, v_row.produto_id, 'ENTRADA', v_row.quantidade_baixada, 'CORRECAO_ORCAMENTO',
                'verificacao:' || v_row.verificacao_id::text || ';servico:' || v_row.servico_id,
                coalesce(nullif(btrim(p_actor), ''), 'AutoOS'), clock_timestamp()
            );
            UPDATE public.orcamento_consumos AS consumption
               SET quantidade_baixada = 0
             WHERE consumption.verificacao_id = v_row.verificacao_id
               AND consumption.servico_id = v_row.servico_id
               AND consumption.produto_id = v_row.produto_id
               AND consumption.empresa_id = v_tenant_id;
            v_total := v_total + v_row.quantidade_baixada;
        END LOOP;
    END IF;

    UPDATE public.orcamento_consumos AS consumption
       SET quantidade_aprovada = 0, quantidade_baixada = 0
     WHERE consumption.verificacao_id = v_verification_id
       AND consumption.empresa_id = v_tenant_id;

    DELETE FROM public.orcamento_servicos_decisao AS decision
     WHERE decision.verificacao_id = v_verification_id
       AND decision.empresa_id = v_tenant_id;

    RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION private.saas_return_and_reset_quote_stock(uuid, boolean, text)
    FROM PUBLIC, anon, authenticated, service_role;
