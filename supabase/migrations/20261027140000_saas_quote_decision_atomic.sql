-- Ajuste/correção de orçamento aprovado no SaaS em uma transação.
-- Equivale a atualizar_servicos_verificacao + corrigir_na_transacao + prorrogar_prazo_orcamento.
-- Idempotente (CREATE OR REPLACE). Não aplicar em projeto de produção nesta PR:
-- o arquivo só entra no repositório para o Paulo revisar.

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
BEGIN
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active company identity is required' USING ERRCODE = '42501';
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

-- Mesmas checagens da baixa pendente (auth, tenant, STOCK_CONTROL) + OS APROVADO.
-- Zera quantidade_aprovada e apaga orcamento_servicos_decisao, como no desktop.
CREATE OR REPLACE FUNCTION public.saas_devolver_pecas_baixadas_orcamento(p_equipment_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_actor text;
    v_status text;
    v_total integer := 0;
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

    SELECT upper(COALESCE(equipment.status, ''))
      INTO v_status
      FROM public.equipamentos AS equipment
     WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
     FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    IF v_status IS DISTINCT FROM 'APROVADO' THEN
        RAISE EXCEPTION 'OS is not approved or is unavailable for this company' USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('autoos.authorized_budget_rpc', 'STOCK_CONTROL', true);
    v_total := private.saas_return_and_reset_quote_stock(p_equipment_id, true, v_actor);
    RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_save_equipment_quote_adjustment(
    p_equipment_id uuid,
    p_expected_updated_em timestamp without time zone,
    p_services jsonb,
    p_parts jsonb,
    p_total numeric,
    p_observations text,
    p_new_status text,
    p_approval_deadline date,
    p_payment_code text,
    p_payment_detail text,
    p_correction_reason text,
    p_modo_aprovado text,
    p_devolver_estoque boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_actor text;
    v_modo text := NULLIF(upper(BTRIM(p_modo_aprovado)), '');
    v_status text;
    v_baixado integer := 0;
    v_result jsonb;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL
       OR NOT private.saas_has_permission('FINANCIAL_ACTIONS') THEN
        RAISE EXCEPTION 'Financial permission is required' USING ERRCODE = '42501';
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
    IF v_modo IS NOT NULL AND v_modo NOT IN ('SEM_NOVA_APROVACAO', 'NOVA_APROVACAO') THEN
        RAISE EXCEPTION 'Quote adjustment mode is invalid' USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('autoos.authorized_budget_rpc', 'FINANCIAL_ACTIONS', true);

    SELECT upper(COALESCE(equipment.status, ''))
      INTO v_status
      FROM public.equipamentos AS equipment
     WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
     FOR UPDATE;
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;

    IF v_modo = 'NOVA_APROVACAO' THEN
        IF v_status IS DISTINCT FROM 'APROVADO' THEN
            RAISE EXCEPTION 'OS is not approved or is unavailable for this company' USING ERRCODE = '22023';
        END IF;
        SELECT coalesce(sum(consumption.quantidade_baixada), 0)::integer
          INTO v_baixado
          FROM public.orcamento_consumos AS consumption
          JOIN public.verificacoes AS verification
            ON verification.id = consumption.verificacao_id
           AND verification.empresa_id = consumption.empresa_id
         WHERE verification.equipamento_id = p_equipment_id
           AND consumption.empresa_id = v_tenant_id
           AND consumption.quantidade_baixada > 0;
        IF v_baixado > 0 AND coalesce(p_devolver_estoque, false) IS NOT TRUE THEN
            RAISE EXCEPTION '% peça(s) já foram baixadas do estoque. Confirme a devolução ao estoque, o que só vale se as peças estiverem intactas.', v_baixado
                USING ERRCODE = '22023';
        END IF;
    END IF;

    v_result := public.saas_update_equipment_quote(
        p_equipment_id, p_expected_updated_em, p_services, p_parts, p_total,
        p_observations, p_new_status, p_approval_deadline, p_payment_code,
        p_payment_detail, p_correction_reason
    );

    IF v_modo = 'NOVA_APROVACAO' THEN
        PERFORM private.saas_return_and_reset_quote_stock(
            p_equipment_id, coalesce(p_devolver_estoque, false) AND v_baixado > 0, v_actor
        );
        UPDATE public.verificacoes AS verification
           SET forma_pagamento_codigo = NULL, forma_pagamento_detalhe = NULL
         WHERE verification.equipamento_id = p_equipment_id
           AND verification.empresa_id = v_tenant_id;
        UPDATE public.equipamentos AS equipment
           SET data_aprovacao = NULL, data_reprovacao = NULL
         WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id;
        SELECT jsonb_set(v_result, '{equipment}', to_jsonb(equipment))
          INTO v_result
          FROM public.equipamentos AS equipment
         WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id;
    END IF;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_analisar_correcao_decisao(p_equipment_id uuid)
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
    pagamento_codigo text;
    pagamento_detalhe text;
    valor_atual numeric;
    valor_original numeric;
    tem_original boolean := false;
    ajustada_depois boolean := false;
    bloqueios jsonb := '[]'::jsonb;
    permite_restaurar boolean;
    permite_manter boolean;
BEGIN
    IF tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active company identity is required' USING ERRCODE = '42501';
    END IF;
    IF NOT private.saas_has_permission('FINANCIAL_ACTIONS') THEN
        RAISE EXCEPTION 'Financial permission is required' USING ERRCODE = '42501';
    END IF;

    SELECT upper(COALESCE(item.status, ''))
      INTO equipment_status
      FROM public.equipamentos AS item
     WHERE item.id = p_equipment_id AND item.empresa_id = tenant_id;
    IF equipment_status IS NULL THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;

    SELECT verification.forma_pagamento_codigo,
           verification.forma_pagamento_detalhe,
           verification.custo_total,
           verification.valor_orcamento_original,
           (verification.servicos_orcamento_original IS NOT NULL AND verification.valor_orcamento_original IS NOT NULL),
           CASE
               WHEN verification.adjusted_at IS NULL THEN false
               WHEN NULLIF(BTRIM(CASE WHEN equipment_status = 'REPROVADO' THEN equipment.data_reprovacao ELSE equipment.data_aprovacao END), '') IS NULL THEN true
               ELSE verification.adjusted_at
                    > (NULLIF(BTRIM(CASE WHEN equipment_status = 'REPROVADO' THEN equipment.data_reprovacao ELSE equipment.data_aprovacao END), ''))::timestamp
           END
      INTO pagamento_codigo, pagamento_detalhe, valor_atual, valor_original, tem_original, ajustada_depois
      FROM public.verificacoes AS verification
      JOIN public.equipamentos AS equipment
        ON equipment.id = verification.equipamento_id
       AND equipment.empresa_id = verification.empresa_id
     WHERE verification.equipamento_id = p_equipment_id
       AND verification.empresa_id = tenant_id
     ORDER BY verification.data_inicio DESC NULLS LAST, verification.id DESC
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No verification exists for this equipment' USING ERRCODE = 'P0002';
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

    IF equipment_status = 'AGUARDANDO_APROVACAO' THEN
        bloqueios := jsonb_build_array('O orçamento já está aguardando aprovação, então não há decisão para corrigir.');
    ELSIF equipment_status NOT IN ('APROVADO', 'REPROVADO') THEN
        bloqueios := jsonb_build_array(
            'O atendimento já passou da decisão (etapa atual: ' || equipment_status
            || '). Só dá para corrigir enquanto o orçamento está Aprovado ou Reprovado, porque depois o serviço pode ter começado e as peças podem ter sido usadas. Se for preciso voltar, use Mudar Status e confira o estoque das peças.'
        );
    END IF;

    permite_restaurar := tem_original;
    permite_manter := ajustada_depois OR NOT tem_original;

    RETURN jsonb_build_object(
        'status', equipment_status,
        'podeCorrigir', jsonb_array_length(bloqueios) = 0,
        'bloqueios', bloqueios,
        'ajustadoAposDecisao', coalesce(ajustada_depois, false),
        'permiteRestaurar', permite_restaurar,
        'permiteManter', permite_manter,
        'pagamentoCodigo', pagamento_codigo,
        'pagamentoDetalhe', pagamento_detalhe,
        'valorAtual', valor_atual,
        'valorOriginal', valor_original,
        'pecasBaixadas', pecas,
        'totalBaixado', total_baixado,
        'exigeDecisaoEstoque', total_baixado > 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_corrigir_decisao_orcamento(
    p_equipment_id uuid,
    p_expected_updated_em timestamp without time zone,
    p_motivo text,
    p_devolver_estoque boolean,
    p_modo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_actor record;
    v_modo text := NULLIF(upper(BTRIM(p_modo)), '');
    v_motivo text := NULLIF(BTRIM(p_motivo), '');
    v_analise jsonb;
    v_verificacao public.verificacoes%ROWTYPE;
    v_equipment public.equipamentos%ROWTYPE;
    v_valor numeric;
    v_baixado integer;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL
       OR NOT private.saas_has_permission('FINANCIAL_ACTIONS') THEN
        RAISE EXCEPTION 'Financial permission is required' USING ERRCODE = '42501';
    END IF;
    IF v_motivo IS NULL OR char_length(v_motivo) < 5 THEN
        RAISE EXCEPTION 'Informe o motivo da correção (mínimo de 5 caracteres).' USING ERRCODE = '22023';
    END IF;
    IF v_modo IS NULL OR v_modo NOT IN ('RESTAURAR_ORIGINAL', 'MANTER_ATUAL') THEN
        RAISE EXCEPTION 'Correction mode is invalid' USING ERRCODE = '22023';
    END IF;
    IF p_expected_updated_em IS NULL THEN
        RAISE EXCEPTION 'A versão atual do equipamento não está disponível. Recarregue e tente novamente.' USING ERRCODE = '22023';
    END IF;

    SELECT identity.auth_user_id, identity.empresa_id, identity.profile_id, profile.nome
      INTO v_actor
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;
    IF v_actor.profile_id IS NULL THEN
        RAISE EXCEPTION 'Active SaaS profile is required' USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('autoos.authorized_budget_rpc', 'FINANCIAL_ACTIONS', true);

    v_analise := public.saas_analisar_correcao_decisao(p_equipment_id);
    IF (v_analise ->> 'podeCorrigir') IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION '%', coalesce(v_analise -> 'bloqueios' ->> 0, 'Não dá para corrigir a decisão agora')
            USING ERRCODE = '22023';
    END IF;
    IF v_modo = 'RESTAURAR_ORIGINAL' AND (v_analise ->> 'permiteRestaurar') IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Este orçamento não guardou a versão enviada ao cliente, então não dá para restaurá-la. Escolha voltar para aguardando aprovação mantendo o orçamento atual.'
            USING ERRCODE = '22023';
    END IF;
    IF v_modo = 'MANTER_ATUAL' AND (v_analise ->> 'permiteManter') IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'O orçamento não foi alterado depois da decisão. Use a opção de restaurar o orçamento enviado ao cliente.'
            USING ERRCODE = '22023';
    END IF;

    v_baixado := coalesce((v_analise ->> 'totalBaixado')::integer, 0);
    IF v_baixado > 0 AND coalesce(p_devolver_estoque, false) IS NOT TRUE THEN
        RAISE EXCEPTION '% peça(s) já foram baixadas do estoque. Confirme a devolução ao estoque, o que só vale se as peças estiverem intactas.', v_baixado
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_equipment
      FROM public.equipamentos AS equipment
     WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
     FOR UPDATE;
    IF v_equipment.atualizado_em IS DISTINCT FROM p_expected_updated_em THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;

    SELECT * INTO v_verificacao
      FROM public.verificacoes AS verification
     WHERE verification.equipamento_id = p_equipment_id
       AND verification.empresa_id = v_tenant_id
     ORDER BY verification.data_inicio DESC NULLS LAST, verification.id DESC
     LIMIT 1
     FOR UPDATE;

    v_valor := CASE
        WHEN v_modo = 'RESTAURAR_ORIGINAL' THEN v_verificacao.valor_orcamento_original
        ELSE v_verificacao.custo_total
    END;
    IF v_valor IS NULL THEN
        RAISE EXCEPTION 'O orçamento atual não tem valor registrado. Restaure o orçamento enviado ao cliente.' USING ERRCODE = '22023';
    END IF;

    PERFORM private.saas_return_and_reset_quote_stock(
        p_equipment_id, coalesce(p_devolver_estoque, false) AND v_baixado > 0, v_actor.nome
    );

    IF v_modo = 'RESTAURAR_ORIGINAL' THEN
        UPDATE public.verificacoes AS verification
           SET servicos_necessarios = verification.servicos_orcamento_original::text,
               pecas_necessarias = COALESCE(verification.pecas_orcamento_original::text, verification.pecas_necessarias),
               custo_total = verification.valor_orcamento_original,
               forma_pagamento_codigo = NULL,
               forma_pagamento_detalhe = NULL
         WHERE verification.id = v_verificacao.id AND verification.empresa_id = v_tenant_id;
    ELSE
        UPDATE public.verificacoes AS verification
           SET forma_pagamento_codigo = NULL, forma_pagamento_detalhe = NULL
         WHERE verification.id = v_verificacao.id AND verification.empresa_id = v_tenant_id;
    END IF;

    PERFORM set_config('autoos.status_correction_reason', left(v_motivo, 500), true);

    UPDATE public.equipamentos AS equipment
       SET status = 'AGUARDANDO_APROVACAO',
           valor_orcamento = v_valor,
           data_aprovacao = NULL,
           data_reprovacao = NULL,
           atualizado_em = clock_timestamp()
     WHERE equipment.id = p_equipment_id
       AND equipment.empresa_id = v_tenant_id
       AND equipment.atualizado_em = p_expected_updated_em
     RETURNING * INTO v_equipment;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.security_audit_log (
        empresa_id, event_type, profile_id, profile_name, details, success, auth_user_id, occurred_at
    ) VALUES (
        v_tenant_id,
        'BUDGET_DECISION_CORRECTED',
        v_actor.profile_id,
        v_actor.nome,
        jsonb_build_object(
            'equipment_id', p_equipment_id,
            'modo', v_modo,
            'status_anterior', v_analise ->> 'status',
            'estoque_devolvido', v_baixado > 0 AND coalesce(p_devolver_estoque, false),
            'pecas_devolvidas', v_baixado,
            'motivo', v_motivo
        )::text,
        true,
        v_actor.auth_user_id,
        clock_timestamp()
    );

    RETURN jsonb_build_object(
        'equipment', to_jsonb(v_equipment),
        'portal', jsonb_build_object('acao', 'NENHUMA')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_prorrogar_prazo_orcamento(
    p_equipment_id uuid,
    p_expected_updated_em timestamp without time zone,
    p_novo_prazo date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_actor record;
    v_equipment public.equipamentos%ROWTYPE;
    v_prazo_ok boolean;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL
       OR NOT (
            private.saas_has_permission('FINANCIAL_ACTIONS')
            OR private.saas_has_permission('PREPARE_QUOTES')
       ) THEN
        RAISE EXCEPTION 'Financial or quote-preparation permission is required' USING ERRCODE = '42501';
    END IF;
    IF p_expected_updated_em IS NULL THEN
        RAISE EXCEPTION 'Token de concorrência de equipamento é obrigatório para atualizar o registro.' USING ERRCODE = '22023';
    END IF;
    IF p_novo_prazo IS NULL THEN
        RAISE EXCEPTION 'Informe o novo prazo no formato AAAA-MM-DD.' USING ERRCODE = '22023';
    END IF;

    SELECT identity.auth_user_id, identity.empresa_id, identity.profile_id, profile.nome
      INTO v_actor
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;
    IF v_actor.profile_id IS NULL THEN
        RAISE EXCEPTION 'Active SaaS profile is required' USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('autoos.authorized_budget_rpc', 'PREPARE_QUOTES', true);

    SELECT * INTO v_equipment
      FROM public.equipamentos AS equipment
     WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    IF upper(COALESCE(v_equipment.status, '')) IS DISTINCT FROM 'AGUARDANDO_APROVACAO' THEN
        RAISE EXCEPTION 'Só dá para prorrogar enquanto o orçamento aguarda aprovação.' USING ERRCODE = '22023';
    END IF;
    IF v_equipment.atualizado_em IS DISTINCT FROM p_expected_updated_em THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;

    SELECT p_novo_prazo >= (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date
      INTO v_prazo_ok;
    IF NOT v_prazo_ok THEN
        RAISE EXCEPTION 'O novo prazo não pode ser anterior a hoje.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.equipamentos AS equipment
       SET prazo_aprovacao = p_novo_prazo::text, atualizado_em = clock_timestamp()
     WHERE equipment.id = p_equipment_id
       AND equipment.empresa_id = v_tenant_id
       AND equipment.atualizado_em = p_expected_updated_em
     RETURNING * INTO v_equipment;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;

    INSERT INTO public.security_audit_log (
        empresa_id, event_type, profile_id, profile_name, details, success, auth_user_id, occurred_at
    ) VALUES (
        v_tenant_id,
        'BUDGET_DEADLINE_EXTENDED',
        v_actor.profile_id,
        v_actor.nome,
        jsonb_build_object(
            'equipment_id', p_equipment_id,
            'novo_prazo', p_novo_prazo
        )::text,
        true,
        v_actor.auth_user_id,
        clock_timestamp()
    );

    RETURN jsonb_build_object(
        'prorrogado', true,
        'respostaPendente', null,
        'equipment', to_jsonb(v_equipment),
        'portal', jsonb_build_object('acao', 'NENHUMA')
    );
END;
$$;

-- RPCs autorizados (FINANCIAL / PREPARE / STOCK já checados) podem gravar
-- estoque e prazo sem exigir a outra permissão da trigger de tabela.
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
            IF NOT private.saas_has_permission(required_permission) THEN
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

ALTER FUNCTION public.saas_devolver_pecas_baixadas_orcamento(uuid) OWNER TO postgres;
ALTER FUNCTION public.saas_save_equipment_quote_adjustment(uuid, timestamp, jsonb, jsonb, numeric, text, text, date, text, text, text, text, boolean) OWNER TO postgres;
ALTER FUNCTION public.saas_analisar_correcao_decisao(uuid) OWNER TO postgres;
ALTER FUNCTION public.saas_corrigir_decisao_orcamento(uuid, timestamp, text, boolean, text) OWNER TO postgres;
ALTER FUNCTION public.saas_prorrogar_prazo_orcamento(uuid, timestamp, date) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.saas_devolver_pecas_baixadas_orcamento(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.saas_save_equipment_quote_adjustment(uuid, timestamp, jsonb, jsonb, numeric, text, text, date, text, text, text, text, boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.saas_analisar_correcao_decisao(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.saas_corrigir_decisao_orcamento(uuid, timestamp, text, boolean, text) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.saas_prorrogar_prazo_orcamento(uuid, timestamp, date) FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.saas_devolver_pecas_baixadas_orcamento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_save_equipment_quote_adjustment(uuid, timestamp, jsonb, jsonb, numeric, text, text, date, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_analisar_correcao_decisao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_corrigir_decisao_orcamento(uuid, timestamp, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_prorrogar_prazo_orcamento(uuid, timestamp, date) TO authenticated;
