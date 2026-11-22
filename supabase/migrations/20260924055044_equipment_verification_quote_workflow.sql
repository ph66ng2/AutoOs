-- Fluxo operacional SaaS de verificação, orçamento e status.
-- Todos os RPCs são SECURITY INVOKER: RLS e os triggers de autorização
-- existentes continuam aplicados ao papel authenticated.

ALTER TABLE public.verificacoes
    ADD COLUMN IF NOT EXISTS forma_pagamento_codigo text,
    ADD COLUMN IF NOT EXISTS forma_pagamento_detalhe text,
    ADD COLUMN IF NOT EXISTS adjusted_at timestamp,
    ADD COLUMN IF NOT EXISTS adjusted_by_profile_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.verificacoes'::regclass
           AND conname = 'chk_verificacoes_forma_pagamento_codigo'
    ) THEN
        ALTER TABLE public.verificacoes
            ADD CONSTRAINT chk_verificacoes_forma_pagamento_codigo
            CHECK (
                forma_pagamento_codigo IS NULL
                OR forma_pagamento_codigo IN (
                    'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO',
                    'DINHEIRO', 'TRANSFERENCIA', 'A_COMBINAR', 'OUTRO'
                )
            ) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.verificacoes'::regclass
           AND conname = 'chk_verificacoes_forma_pagamento_outro_detalhe'
    ) THEN
        ALTER TABLE public.verificacoes
            ADD CONSTRAINT chk_verificacoes_forma_pagamento_outro_detalhe
            CHECK (
                forma_pagamento_codigo IS DISTINCT FROM 'OUTRO'
                OR NULLIF(BTRIM(forma_pagamento_detalhe), '') IS NOT NULL
            ) NOT VALID;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.verificacoes'::regclass
           AND conname = 'fk_verificacoes_adjusted_by_profile'
    ) THEN
        ALTER TABLE public.verificacoes
            ADD CONSTRAINT fk_verificacoes_adjusted_by_profile
            FOREIGN KEY (adjusted_by_profile_id)
            REFERENCES public.security_profiles(id) ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_verificacoes_tenant_equipment_latest
    ON public.verificacoes (empresa_id, equipamento_id, data_inicio DESC, id DESC);

-- Correções de status exigem motivo no servidor e acrescentam esse motivo à
-- trilha existente. O GUC é transacional e só é preenchido pelo RPC abaixo.
CREATE OR REPLACE FUNCTION private.require_saas_status_correction_reason()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    reason text := NULLIF(BTRIM(current_setting('autoos.status_correction_reason', true)), '');
BEGIN
    IF private.saas_is_trusted_maintenance_session() THEN
        RETURN NEW;
    END IF;

    IF upper(COALESCE(OLD.status, '')) IS DISTINCT FROM upper(COALESCE(NEW.status, ''))
       AND NOT private.saas_is_regular_equipment_transition(OLD.status, NEW.status)
       AND private.saas_is_equipment_status_correction(OLD.status, NEW.status)
       AND (reason IS NULL OR char_length(reason) > 500) THEN
        RAISE EXCEPTION 'A status correction requires a reason of at most 500 characters'
            USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.require_saas_status_correction_reason()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.audit_saas_status_correction_reason()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor record;
    reason text := NULLIF(BTRIM(current_setting('autoos.status_correction_reason', true)), '');
BEGIN
    IF private.saas_is_trusted_maintenance_session()
       OR upper(COALESCE(OLD.status, '')) IS NOT DISTINCT FROM upper(COALESCE(NEW.status, ''))
       OR private.saas_is_regular_equipment_transition(OLD.status, NEW.status)
       OR NOT private.saas_is_equipment_status_correction(OLD.status, NEW.status) THEN
        RETURN NEW;
    END IF;

    SELECT identity.auth_user_id, identity.empresa_id, identity.profile_id, profile.nome
      INTO actor
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;
    IF NOT FOUND OR reason IS NULL OR char_length(reason) > 500 THEN
        RAISE EXCEPTION 'Status correction audit context is unavailable'
            USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.security_audit_log (
        empresa_id, event_type, profile_id, profile_name, details,
        success, auth_user_id, occurred_at
    ) VALUES (
        actor.empresa_id,
        'EQUIPMENT_STATUS_CORRECTED',
        actor.profile_id,
        actor.nome,
        jsonb_build_object(
            'equipment_id', NEW.id,
            'old_status', OLD.status,
            'new_status', NEW.status,
            'reason', reason
        )::text,
        true,
        actor.auth_user_id,
        clock_timestamp()
    );
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.audit_saas_status_correction_reason()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS saas_status_correction_reason_guard ON public.equipamentos;
CREATE TRIGGER saas_status_correction_reason_guard
    BEFORE UPDATE OF status ON public.equipamentos
    FOR EACH ROW EXECUTE FUNCTION private.require_saas_status_correction_reason();

DROP TRIGGER IF EXISTS saas_status_correction_reason_audit ON public.equipamentos;
CREATE TRIGGER saas_status_correction_reason_audit
    AFTER UPDATE OF status ON public.equipamentos
    FOR EACH ROW EXECUTE FUNCTION private.audit_saas_status_correction_reason();

CREATE OR REPLACE FUNCTION public.saas_finalize_equipment_verification(
    p_equipment_id uuid,
    p_expected_updated_em timestamp without time zone,
    p_verification jsonb,
    p_approval_deadline date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    tenant_id uuid := (SELECT public.current_company_id());
    equipment public.equipamentos%ROWTYPE;
    verification public.verificacoes%ROWTYPE;
    services text;
    parts text;
    checklist text;
    total numeric;
    labor numeric;
    parts_cost numeric;
    services_total numeric;
    parts_total numeric;
    duration integer;
BEGIN
    IF tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active company identity is required' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_verification) IS DISTINCT FROM 'object'
       OR NULLIF(BTRIM(p_verification ->> 'tecnico_nome'), '') IS NULL
       OR NULLIF(BTRIM(p_verification ->> 'problema_relatado'), '') IS NULL THEN
        RAISE EXCEPTION 'Technician and reported problem are required' USING ERRCODE = '22023';
    END IF;

    checklist := COALESCE(p_verification -> 'itens_verificados', '[]'::jsonb)::text;
    services := COALESCE(p_verification -> 'servicos_necessarios', '[]'::jsonb)::text;
    parts := COALESCE(p_verification -> 'pecas_necessarias', '[]'::jsonb)::text;
    IF jsonb_typeof(checklist::jsonb) IS DISTINCT FROM 'array'
       OR jsonb_typeof(services::jsonb) IS DISTINCT FROM 'array'
       OR jsonb_typeof(parts::jsonb) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Verification checklist, services and parts must be arrays' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(checklist::jsonb) AS row(value)
         WHERE jsonb_typeof(row.value) IS DISTINCT FROM 'object'
            OR NULLIF(BTRIM(row.value ->> 'nome'), '') IS NULL
            OR jsonb_typeof(row.value -> 'verificado') IS DISTINCT FROM 'boolean'
    ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(services::jsonb) AS row(value)
         WHERE jsonb_typeof(row.value) IS DISTINCT FROM 'object'
            OR NULLIF(BTRIM(row.value ->> 'descricao'), '') IS NULL
            OR CASE WHEN jsonb_typeof(row.value -> 'valor') = 'number'
                    THEN (row.value ->> 'valor')::numeric < 0 ELSE true END
    ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(parts::jsonb) AS row(value)
         WHERE jsonb_typeof(row.value) IS DISTINCT FROM 'object'
            OR NULLIF(BTRIM(row.value ->> 'nome'), '') IS NULL
            OR CASE WHEN jsonb_typeof(row.value -> 'quantidade') = 'number'
                    THEN (row.value ->> 'quantidade')::numeric <= 0
                      OR trunc((row.value ->> 'quantidade')::numeric) <> (row.value ->> 'quantidade')::numeric
                    ELSE true END
            OR CASE WHEN jsonb_typeof(row.value -> 'valorUnitario') = 'number'
                    THEN (row.value ->> 'valorUnitario')::numeric < 0 ELSE true END
            OR CASE WHEN jsonb_typeof(row.value -> 'valorTotal') = 'number'
                    AND jsonb_typeof(row.value -> 'quantidade') = 'number'
                    AND jsonb_typeof(row.value -> 'valorUnitario') = 'number'
                    THEN round((row.value ->> 'valorTotal')::numeric, 2)
                           <> round((row.value ->> 'quantidade')::numeric * (row.value ->> 'valorUnitario')::numeric, 2)
                    ELSE true END
    ) THEN
        RAISE EXCEPTION 'Verification rows contain invalid checklist, service or part values' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(sum((row.value ->> 'valor')::numeric), 0)
      INTO services_total FROM jsonb_array_elements(services::jsonb) AS row(value);
    SELECT COALESCE(sum((row.value ->> 'valorTotal')::numeric), 0)
      INTO parts_total FROM jsonb_array_elements(parts::jsonb) AS row(value);
    labor := COALESCE((p_verification ->> 'custo_estimado_mao_obra')::numeric, 0);
    parts_cost := COALESCE((p_verification ->> 'custo_estimado_pecas')::numeric, 0);
    total := COALESCE((p_verification ->> 'custo_total')::numeric, 0);
    duration := COALESCE((p_verification ->> 'tempo_estimado')::integer, 0);
    IF labor < 0 OR parts_cost < 0 OR total < 0 OR duration < 0
       OR round(labor, 2) <> round(services_total, 2)
       OR round(parts_cost, 2) <> round(parts_total, 2)
       OR round(total, 2) <> round(labor + parts_cost, 2) THEN
        RAISE EXCEPTION 'Verification values must be non-negative and total their components' USING ERRCODE = '22023';
    END IF;
    IF p_approval_deadline IS NULL THEN
        RAISE EXCEPTION 'Approval deadline is required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO equipment
      FROM public.equipamentos AS item
     WHERE item.id = p_equipment_id
       AND item.empresa_id = tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    IF equipment.atualizado_em IS DISTINCT FROM p_expected_updated_em THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;
    IF upper(COALESCE(equipment.status, '')) <> 'EM_VERIFICACAO' THEN
        RAISE EXCEPTION 'Only equipment under verification can be finalized' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.verificacoes (
        empresa_id, equipamento_id, tecnico_nome, data_fim,
        problema_relatado, diagnostico, itens_verificados,
        servicos_necessarios, pecas_necessarias,
        custo_estimado_mao_obra, custo_estimado_pecas, custo_total,
        tempo_estimado, concluida, observacoes
    ) VALUES (
        tenant_id, equipment.id, BTRIM(p_verification ->> 'tecnico_nome'), clock_timestamp(),
        BTRIM(p_verification ->> 'problema_relatado'),
        NULLIF(BTRIM(p_verification ->> 'diagnostico'), ''), checklist,
        services, parts, labor, parts_cost, total, duration, true,
        NULLIF(BTRIM(p_verification ->> 'observacoes'), '')
    ) RETURNING * INTO verification;

    UPDATE public.equipamentos AS item
       SET status = 'VERIFICADO', data_verificacao = current_date::text,
           valor_orcamento = total, atualizado_em = clock_timestamp()
     WHERE item.id = equipment.id AND item.empresa_id = tenant_id;
    UPDATE public.equipamentos AS item
       SET status = 'AGUARDANDO_APROVACAO', prazo_aprovacao = p_approval_deadline::text,
           atualizado_em = clock_timestamp()
     WHERE item.id = equipment.id AND item.empresa_id = tenant_id
     RETURNING * INTO equipment;

    RETURN jsonb_build_object('equipment', to_jsonb(equipment), 'verification', to_jsonb(verification));
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_update_equipment_quote(
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
    p_correction_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    tenant_id uuid := (SELECT public.current_company_id());
    equipment public.equipamentos%ROWTYPE;
    verification public.verificacoes%ROWTYPE;
    target_status text := NULLIF(upper(BTRIM(p_new_status)), '');
    reason text := NULLIF(BTRIM(p_correction_reason), '');
    regular_transition boolean;
    correction_transition boolean;
BEGIN
    IF tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active company identity is required' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_services) IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_parts) IS DISTINCT FROM 'array'
       OR p_total IS NULL OR p_total < 0 THEN
        RAISE EXCEPTION 'Quote data is invalid' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_services) AS row(value)
         WHERE jsonb_typeof(row.value) IS DISTINCT FROM 'object'
            OR NULLIF(BTRIM(row.value ->> 'descricao'), '') IS NULL
            OR CASE WHEN jsonb_typeof(row.value -> 'valor') = 'number'
                    THEN (row.value ->> 'valor')::numeric < 0 ELSE true END
    ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_parts) AS row(value)
         WHERE jsonb_typeof(row.value) IS DISTINCT FROM 'object'
            OR NULLIF(BTRIM(row.value ->> 'nome'), '') IS NULL
            OR CASE WHEN jsonb_typeof(row.value -> 'quantidade') = 'number'
                    THEN (row.value ->> 'quantidade')::numeric <= 0
                      OR trunc((row.value ->> 'quantidade')::numeric) <> (row.value ->> 'quantidade')::numeric
                    ELSE true END
            OR CASE WHEN jsonb_typeof(row.value -> 'valorUnitario') = 'number'
                    THEN (row.value ->> 'valorUnitario')::numeric < 0 ELSE true END
            OR CASE WHEN jsonb_typeof(row.value -> 'valorTotal') = 'number'
                    AND jsonb_typeof(row.value -> 'quantidade') = 'number'
                    AND jsonb_typeof(row.value -> 'valorUnitario') = 'number'
                    THEN round((row.value ->> 'valorTotal')::numeric, 2)
                           <> round((row.value ->> 'quantidade')::numeric * (row.value ->> 'valorUnitario')::numeric, 2)
                    ELSE true END
    ) THEN
        RAISE EXCEPTION 'Quote rows contain invalid service or part values' USING ERRCODE = '22023';
    END IF;
    IF p_payment_code IS NOT NULL AND p_payment_code NOT IN (
        'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO',
        'DINHEIRO', 'TRANSFERENCIA', 'A_COMBINAR', 'OUTRO'
    ) THEN
        RAISE EXCEPTION 'Payment method is invalid' USING ERRCODE = '22023';
    END IF;
    IF p_payment_code = 'OUTRO' AND NULLIF(BTRIM(p_payment_detail), '') IS NULL THEN
        RAISE EXCEPTION 'Describe the other payment method' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO equipment
      FROM public.equipamentos AS item
     WHERE item.id = p_equipment_id AND item.empresa_id = tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    IF equipment.atualizado_em IS DISTINCT FROM p_expected_updated_em THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;
    IF target_status = 'APROVADO' THEN
        RAISE EXCEPTION 'Use the approval operation with a payment method' USING ERRCODE = '22023';
    END IF;
    IF target_status IS NOT NULL AND target_status NOT IN ('AGUARDANDO_APROVACAO', upper(COALESCE(equipment.status, ''))) THEN
        RAISE EXCEPTION 'Quote editing cannot apply this equipment status' USING ERRCODE = '22023';
    END IF;
    regular_transition := upper(COALESCE(equipment.status, '')) = target_status
        OR (upper(COALESCE(equipment.status, '')), target_status) IN (
            ('VERIFICADO', 'AGUARDANDO_APROVACAO'),
            ('REPROVADO', 'AGUARDANDO_APROVACAO'),
            ('ORCAMENTO_VENCIDO', 'AGUARDANDO_APROVACAO')
        );
    correction_transition := (upper(COALESCE(equipment.status, '')), target_status) IN (
        ('APROVADO', 'AGUARDANDO_APROVACAO')
    );
    IF target_status IS NOT NULL AND NOT regular_transition AND NOT correction_transition THEN
        RAISE EXCEPTION 'Invalid equipment status transition' USING ERRCODE = '22023';
    END IF;
    IF target_status IS NOT NULL AND correction_transition THEN
        IF reason IS NULL OR char_length(reason) > 500 THEN
            RAISE EXCEPTION 'A correction reason of at most 500 characters is required' USING ERRCODE = '22023';
        END IF;
        PERFORM set_config('autoos.status_correction_reason', reason, true);
    ELSE
        PERFORM set_config('autoos.status_correction_reason', '', true);
    END IF;

    SELECT * INTO verification
      FROM public.verificacoes AS item
     WHERE item.equipamento_id = equipment.id AND item.empresa_id = tenant_id
     ORDER BY item.data_inicio DESC NULLS LAST, item.id DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No verification exists for this equipment' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.verificacoes AS item
       SET servicos_necessarios = p_services::text,
           pecas_necessarias = p_parts::text,
           custo_total = p_total,
           observacoes = CASE WHEN p_observations IS NULL THEN item.observacoes
                              ELSE NULLIF(BTRIM(p_observations), '') END,
           forma_pagamento_codigo = CASE WHEN p_payment_code IS NULL THEN item.forma_pagamento_codigo ELSE p_payment_code END,
           forma_pagamento_detalhe = CASE WHEN p_payment_code IS NULL THEN item.forma_pagamento_detalhe
                                           WHEN p_payment_code = 'OUTRO' THEN NULLIF(BTRIM(p_payment_detail), '')
                                           ELSE NULL END
     WHERE item.id = verification.id
     RETURNING * INTO verification;

    UPDATE public.equipamentos AS item
       SET status = COALESCE(target_status, item.status),
           valor_orcamento = p_total,
           prazo_aprovacao = COALESCE(p_approval_deadline::text, item.prazo_aprovacao),
           data_verificacao = CASE WHEN target_status = 'VERIFICADO' THEN current_date::text ELSE item.data_verificacao END,
           atualizado_em = clock_timestamp()
     WHERE item.id = equipment.id AND item.empresa_id = tenant_id
     RETURNING * INTO equipment;

    RETURN jsonb_build_object('equipment', to_jsonb(equipment), 'verification', to_jsonb(verification));
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_update_equipment_status(
    p_equipment_id uuid,
    p_expected_updated_em timestamp without time zone,
    p_new_status text,
    p_budget numeric,
    p_approval_deadline date,
    p_final_value numeric,
    p_correction_reason text
)
RETURNS public.equipamentos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    tenant_id uuid := (SELECT public.current_company_id());
    equipment public.equipamentos%ROWTYPE;
    target_status text := upper(BTRIM(p_new_status));
    reason text := NULLIF(BTRIM(p_correction_reason), '');
    current_status text;
    regular_transition boolean;
    correction_transition boolean;
BEGIN
    IF tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active company identity is required' USING ERRCODE = '42501';
    END IF;
    IF target_status IS NULL OR target_status NOT IN (
        'RECEBIDO', 'EM_VERIFICACAO', 'VERIFICADO', 'AGUARDANDO_APROVACAO',
        'APROVADO', 'REPROVADO', 'EM_MANUTENCAO', 'AGUARDANDO_PECA',
        'PRONTO', 'ENTREGUE', 'ORCAMENTO_VENCIDO', 'ABANDONADO'
    ) OR p_budget < 0 OR p_final_value < 0 THEN
        RAISE EXCEPTION 'Status or financial values are invalid' USING ERRCODE = '22023';
    END IF;
    IF target_status = 'APROVADO' THEN
        RAISE EXCEPTION 'Use the approval operation with a payment method' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO equipment
      FROM public.equipamentos AS item
     WHERE item.id = p_equipment_id AND item.empresa_id = tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    IF equipment.atualizado_em IS DISTINCT FROM p_expected_updated_em THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;
    current_status := upper(COALESCE(equipment.status, ''));
    regular_transition := current_status = target_status
        OR (current_status, target_status) IN (
            ('RECEBIDO', 'EM_VERIFICACAO'),
            ('EM_VERIFICACAO', 'VERIFICADO'),
            ('VERIFICADO', 'AGUARDANDO_APROVACAO'),
            ('AGUARDANDO_APROVACAO', 'APROVADO'),
            ('AGUARDANDO_APROVACAO', 'REPROVADO'),
            ('AGUARDANDO_APROVACAO', 'ORCAMENTO_VENCIDO'),
            ('APROVADO', 'EM_MANUTENCAO'),
            ('EM_MANUTENCAO', 'AGUARDANDO_PECA'),
            ('EM_MANUTENCAO', 'PRONTO'),
            ('AGUARDANDO_PECA', 'EM_MANUTENCAO'),
            ('PRONTO', 'ENTREGUE'),
            ('REPROVADO', 'AGUARDANDO_APROVACAO'),
            ('REPROVADO', 'ENTREGUE'),
            ('REPROVADO', 'ABANDONADO'),
            ('ORCAMENTO_VENCIDO', 'ABANDONADO'),
            ('ORCAMENTO_VENCIDO', 'AGUARDANDO_APROVACAO')
        );
    correction_transition := (current_status, target_status) IN (
        ('EM_VERIFICACAO', 'RECEBIDO'),
        ('VERIFICADO', 'EM_VERIFICACAO'),
        ('AGUARDANDO_APROVACAO', 'VERIFICADO'),
        ('APROVADO', 'AGUARDANDO_APROVACAO'),
        ('EM_MANUTENCAO', 'APROVADO'),
        ('EM_MANUTENCAO', 'AGUARDANDO_APROVACAO'),
        ('AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO'),
        ('PRONTO', 'EM_MANUTENCAO'),
        ('PRONTO', 'AGUARDANDO_PECA'),
        ('PRONTO', 'AGUARDANDO_APROVACAO')
    );
    IF NOT regular_transition AND NOT correction_transition THEN
        RAISE EXCEPTION 'Invalid equipment status transition' USING ERRCODE = '22023';
    END IF;
    IF correction_transition AND NOT regular_transition THEN
        IF reason IS NULL OR char_length(reason) > 500 THEN
            RAISE EXCEPTION 'A correction reason of at most 500 characters is required' USING ERRCODE = '22023';
        END IF;
        PERFORM set_config('autoos.status_correction_reason', reason, true);
    ELSE
        PERFORM set_config('autoos.status_correction_reason', '', true);
    END IF;

    UPDATE public.equipamentos AS item
       SET status = target_status,
           data_verificacao = CASE WHEN target_status = 'EM_VERIFICACAO' THEN current_date::text ELSE item.data_verificacao END,
           data_aprovacao = CASE WHEN target_status = 'APROVADO' THEN current_date::text ELSE item.data_aprovacao END,
           data_reprovacao = CASE WHEN target_status = 'REPROVADO' THEN current_date::text ELSE item.data_reprovacao END,
           data_pronto = CASE WHEN target_status = 'PRONTO' THEN current_date::text ELSE item.data_pronto END,
           data_saida = CASE WHEN target_status = 'ENTREGUE' THEN current_date::text ELSE item.data_saida END,
           valor_orcamento = COALESCE(p_budget, item.valor_orcamento),
           prazo_aprovacao = COALESCE(p_approval_deadline::text, item.prazo_aprovacao),
           valor_final = COALESCE(p_final_value, item.valor_final),
           atualizado_em = clock_timestamp()
     WHERE item.id = equipment.id AND item.empresa_id = tenant_id
     RETURNING * INTO equipment;
    RETURN equipment;
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_approve_equipment_quote(
    p_equipment_id uuid,
    p_expected_updated_em timestamp without time zone,
    p_payment_code text,
    p_payment_detail text
)
RETURNS public.equipamentos
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    tenant_id uuid := (SELECT public.current_company_id());
    equipment public.equipamentos%ROWTYPE;
    verification public.verificacoes%ROWTYPE;
BEGIN
    IF tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active company identity is required' USING ERRCODE = '42501';
    END IF;
    IF p_payment_code NOT IN (
        'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO',
        'DINHEIRO', 'TRANSFERENCIA', 'A_COMBINAR', 'OUTRO'
    ) OR (p_payment_code = 'OUTRO' AND NULLIF(BTRIM(p_payment_detail), '') IS NULL) THEN
        RAISE EXCEPTION 'Payment method is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO equipment
      FROM public.equipamentos AS item
     WHERE item.id = p_equipment_id AND item.empresa_id = tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    IF equipment.atualizado_em IS DISTINCT FROM p_expected_updated_em THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;
    IF upper(COALESCE(equipment.status, '')) <> 'AGUARDANDO_APROVACAO' THEN
        RAISE EXCEPTION 'Only quotes awaiting approval can be approved' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO verification
      FROM public.verificacoes AS item
     WHERE item.equipamento_id = equipment.id AND item.empresa_id = tenant_id
     ORDER BY item.data_inicio DESC NULLS LAST, item.id DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'A technical verification is required before approval' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.verificacoes AS item
       SET forma_pagamento_codigo = p_payment_code,
           forma_pagamento_detalhe = CASE WHEN p_payment_code = 'OUTRO' THEN NULLIF(BTRIM(p_payment_detail), '') ELSE NULL END
     WHERE item.id = verification.id
     RETURNING * INTO verification;

    UPDATE public.equipamentos AS item
       SET status = 'APROVADO', data_aprovacao = current_date::text,
           atualizado_em = clock_timestamp()
     WHERE item.id = equipment.id AND item.empresa_id = tenant_id
     RETURNING * INTO equipment;

    RETURN equipment;
END;
$$;

REVOKE ALL ON FUNCTION public.saas_finalize_equipment_verification(uuid, timestamp, jsonb, date)
    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_update_equipment_quote(uuid, timestamp, jsonb, jsonb, numeric, text, text, date, text, text, text)
    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_update_equipment_status(uuid, timestamp, text, numeric, date, numeric, text)
    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.saas_approve_equipment_quote(uuid, timestamp, text, text)
    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.saas_finalize_equipment_verification(uuid, timestamp, jsonb, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_update_equipment_quote(uuid, timestamp, jsonb, jsonb, numeric, text, text, date, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_update_equipment_status(uuid, timestamp, text, numeric, date, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_approve_equipment_quote(uuid, timestamp, text, text) TO authenticated;
