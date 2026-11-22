-- Análise e devolução de estoque para ajuste de orçamento aprovado no SaaS
-- (equivalente Online de analisar_ajuste_orcamento + devolver peças na nova aprovação).
-- Nunca editar migrations já aplicadas.

CREATE OR REPLACE FUNCTION public.saas_analisar_ajuste_orcamento(p_equipment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    tenant_id uuid := (SELECT public.current_company_id());
    equipment_status text;
    pecas jsonb := '[]'::jsonb;
    total_baixado integer := 0;
BEGIN
    IF tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active company identity is required' USING ERRCODE = '42501';
    END IF;
    SELECT upper(COALESCE(item.status, ''))
      INTO equipment_status
      FROM public.equipamentos AS item
     WHERE item.id = p_equipment_id AND item.empresa_id = tenant_id;
    IF equipment_status IS NULL THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'produtoId', consumption.produto_id,
               'nome', product.nome,
               'quantidade', consumption.quantidade_baixada
           ) ORDER BY product.nome, consumption.produto_id), '[]'::jsonb),
           coalesce(sum(consumption.quantidade_baixada), 0)::integer
      INTO pecas, total_baixado
      FROM public.orcamento_consumos AS consumption
      JOIN public.verificacoes AS verification
        ON verification.id = consumption.verificacao_id
       AND verification.empresa_id = consumption.empresa_id
      JOIN public.produtos AS product
        ON product.id = consumption.produto_id
       AND product.empresa_id = consumption.empresa_id
     WHERE verification.equipamento_id = p_equipment_id
       AND consumption.empresa_id = tenant_id
       AND consumption.quantidade_baixada > 0;

    RETURN jsonb_build_object(
        'status', equipment_status,
        'podePedirNovaAprovacao', equipment_status = 'APROVADO',
        'jaPublicado', false,
        'versaoAberta', null,
        'respostaPendente', null,
        'pecasBaixadas', pecas,
        'totalBaixado', total_baixado,
        'exigeDecisaoEstoque', total_baixado > 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_devolver_pecas_baixadas_orcamento(p_equipment_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_actor text;
    v_row record;
    v_total bigint := 0;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL
       OR NOT (
            private.saas_has_permission('FINANCIAL_ACTIONS')
            OR private.saas_has_permission('STOCK_CONTROL')
       ) THEN
        RAISE EXCEPTION 'Financial or stock permission is required' USING ERRCODE = '42501';
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
    IF NOT EXISTS (
        SELECT 1 FROM public.equipamentos AS equipment
         WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
         FOR UPDATE
    ) THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;

    FOR v_row IN
        SELECT consumption.verificacao_id, consumption.servico_id, consumption.produto_id,
               consumption.quantidade_baixada
          FROM public.orcamento_consumos AS consumption
          JOIN public.verificacoes AS verification
            ON verification.id = consumption.verificacao_id
           AND verification.empresa_id = consumption.empresa_id
         WHERE verification.equipamento_id = p_equipment_id
           AND consumption.empresa_id = v_tenant_id
           AND consumption.quantidade_baixada > 0
         ORDER BY consumption.produto_id, consumption.servico_id
         FOR UPDATE OF consumption
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
            v_tenant_id, v_row.produto_id, 'ENTRADA', v_row.quantidade_baixada, 'MANUTENCAO',
            'verificacao:' || v_row.verificacao_id::text || ';servico:' || v_row.servico_id || ';devolucao_ajuste',
            v_actor, clock_timestamp()
        );
        UPDATE public.orcamento_consumos AS consumption
           SET quantidade_baixada = 0
         WHERE consumption.verificacao_id = v_row.verificacao_id
           AND consumption.servico_id = v_row.servico_id
           AND consumption.produto_id = v_row.produto_id
           AND consumption.empresa_id = v_tenant_id;
        v_total := v_total + v_row.quantidade_baixada;
    END LOOP;
    RETURN v_total;
END;
$$;

ALTER FUNCTION public.saas_analisar_ajuste_orcamento(uuid) OWNER TO postgres;
ALTER FUNCTION public.saas_devolver_pecas_baixadas_orcamento(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_analisar_ajuste_orcamento(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.saas_devolver_pecas_baixadas_orcamento(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.saas_analisar_ajuste_orcamento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_devolver_pecas_baixadas_orcamento(uuid) TO authenticated;
