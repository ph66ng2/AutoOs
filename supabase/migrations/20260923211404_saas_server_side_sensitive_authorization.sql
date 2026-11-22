-- Autorização funcional SaaS: tenant e perfil vêm exclusivamente do vínculo
-- atual auth.uid() + auth.sessions, nunca de metadados ou payload do cliente.

ALTER TABLE public.security_audit_log
    ADD COLUMN IF NOT EXISTS auth_user_id uuid,
    ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT clock_timestamp();

COMMENT ON COLUMN public.security_audit_log.auth_user_id IS
    'Supabase Auth actor resolved by the database from the current live session; intentionally has no FK so historical actor identity is retained.';
COMMENT ON COLUMN public.security_audit_log.occurred_at IS
    'Timestamp with timezone assigned by PostgreSQL when the audit event is recorded.';

CREATE INDEX IF NOT EXISTS idx_security_audit_log_auth_user_occurred
    ON public.security_audit_log (auth_user_id, occurred_at DESC);

-- A camada local usa os mesmos nomes de permissão. ADMIN permanece autorizado
-- apenas quando o perfil ADMIN atual pertence ao vínculo ativo resolvido acima.
CREATE OR REPLACE FUNCTION private.saas_has_permission(p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM private.current_saas_session_identity() AS identity
          JOIN public.security_profiles AS profile
            ON profile.id = identity.profile_id
           AND profile.empresa_id = identity.empresa_id
         WHERE profile.ativo IS TRUE
           AND (
                profile.role = 'ADMIN'
                OR (
                    jsonb_typeof(profile.permissions::jsonb) = 'array'
                    AND profile.permissions::jsonb ? p_permission
                )
           )
    );
$$;

REVOKE ALL ON FUNCTION private.saas_has_permission(text)
    FROM PUBLIC, anon, authenticated, service_role;

-- SQL migrations/administrative maintenance have no Auth user and run under a
-- database superuser. They remain usable for provisioning and rollback;
-- service_role is deliberately not a bypass for end-user financial actions.
CREATE OR REPLACE FUNCTION private.saas_is_trusted_maintenance_session()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT (SELECT auth.uid()) IS NULL
       AND session_user IN ('postgres', 'supabase_admin');
$$;

REVOKE ALL ON FUNCTION private.saas_is_trusted_maintenance_session()
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.saas_is_financial_equipment_status(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT upper(COALESCE(p_status, '')) = ANY (ARRAY[
        'AGUARDANDO_APROVACAO', 'APROVADO', 'REPROVADO',
        'ORCAMENTO_VENCIDO', 'ENTREGUE', 'ABANDONADO'
    ]);
$$;

CREATE OR REPLACE FUNCTION private.saas_is_regular_equipment_transition(
    p_from_status text,
    p_to_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT upper(COALESCE(p_from_status, '')) = upper(COALESCE(p_to_status, ''))
        OR (upper(COALESCE(p_from_status, '')), upper(COALESCE(p_to_status, ''))) IN (
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
$$;

CREATE OR REPLACE FUNCTION private.saas_is_equipment_status_correction(
    p_from_status text,
    p_to_status text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT (upper(COALESCE(p_from_status, '')), upper(COALESCE(p_to_status, ''))) IN (
        ('EM_VERIFICACAO', 'RECEBIDO'),
        ('VERIFICADO', 'EM_VERIFICACAO'),
        ('AGUARDANDO_APROVACAO', 'VERIFICADO'),
        ('APROVADO', 'AGUARDANDO_APROVACAO'),
        ('EM_MANUTENCAO', 'APROVADO'),
        ('EM_MANUTENCAO', 'AGUARDANDO_APROVACAO'),
        ('AGUARDANDO_PECA', 'EM_MANUTENCAO'),
        ('AGUARDANDO_PECA', 'AGUARDANDO_APROVACAO'),
        ('PRONTO', 'EM_MANUTENCAO'),
        ('PRONTO', 'AGUARDANDO_PECA'),
        ('PRONTO', 'AGUARDANDO_APROVACAO'),
        ('REPROVADO', 'AGUARDANDO_APROVACAO'),
        ('ORCAMENTO_VENCIDO', 'AGUARDANDO_APROVACAO')
    );
$$;

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
    IF cardinality(required_permissions) = 0 THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    SELECT identity.auth_user_id, identity.empresa_id, identity.profile_id, profile.nome
      INTO actor
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;

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

    IF TG_TABLE_NAME = 'verificacoes' AND TG_OP IN ('INSERT', 'UPDATE')
       AND 'FINANCIAL_ACTIONS' = ANY (required_permissions) THEN
        NEW.adjusted_at := clock_timestamp();
        NEW.adjusted_by_profile_id := actor.profile_id;
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION private.audit_saas_sensitive_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
    new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
    required_permissions text[];
    actor record;
    row_id text;
    event_details jsonb;
BEGIN
    IF private.saas_is_trusted_maintenance_session() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    required_permissions := private.saas_required_permissions(
        TG_TABLE_NAME, TG_OP, old_row, new_row
    );
    IF cardinality(required_permissions) = 0 THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    SELECT identity.auth_user_id, identity.empresa_id, identity.profile_id, profile.nome
      INTO actor
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active SaaS identity disappeared before audit recording'
            USING ERRCODE = '42501';
    END IF;

    row_id := COALESCE(new_row ->> 'id', old_row ->> 'id');
    event_details := jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'record_id', row_id,
        'required_permissions', required_permissions,
        'old_status', old_row ->> 'status',
        'new_status', new_row ->> 'status'
    );

    INSERT INTO public.security_audit_log (
        empresa_id, event_type, profile_id, profile_name, details,
        success, auth_user_id, occurred_at
    ) VALUES (
        actor.empresa_id,
        'SAAS_SENSITIVE_MUTATION',
        actor.profile_id,
        actor.nome,
        event_details::text,
        true,
        actor.auth_user_id,
        clock_timestamp()
    );

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION private.saas_is_financial_equipment_status(text)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.saas_is_trusted_maintenance_session()
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.saas_is_regular_equipment_transition(text, text)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.saas_is_equipment_status_correction(text, text)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.saas_required_permissions(text, text, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.enforce_saas_sensitive_mutation()
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_saas_sensitive_mutation()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS saas_sensitive_mutation_guard ON public.equipamentos;
CREATE TRIGGER saas_sensitive_mutation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.equipamentos
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_sensitive_mutation();
DROP TRIGGER IF EXISTS saas_sensitive_mutation_audit ON public.equipamentos;
CREATE TRIGGER saas_sensitive_mutation_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.equipamentos
    FOR EACH ROW EXECUTE FUNCTION private.audit_saas_sensitive_mutation();

DROP TRIGGER IF EXISTS saas_sensitive_mutation_guard ON public.verificacoes;
CREATE TRIGGER saas_sensitive_mutation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.verificacoes
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_sensitive_mutation();
DROP TRIGGER IF EXISTS saas_sensitive_mutation_audit ON public.verificacoes;
CREATE TRIGGER saas_sensitive_mutation_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.verificacoes
    FOR EACH ROW EXECUTE FUNCTION private.audit_saas_sensitive_mutation();

DROP TRIGGER IF EXISTS saas_sensitive_mutation_guard ON public.produtos;
CREATE TRIGGER saas_sensitive_mutation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.produtos
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_sensitive_mutation();
DROP TRIGGER IF EXISTS saas_sensitive_mutation_audit ON public.produtos;
CREATE TRIGGER saas_sensitive_mutation_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.produtos
    FOR EACH ROW EXECUTE FUNCTION private.audit_saas_sensitive_mutation();

DROP TRIGGER IF EXISTS saas_sensitive_mutation_guard ON public.movimentacoes_estoque;
CREATE TRIGGER saas_sensitive_mutation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.movimentacoes_estoque
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_sensitive_mutation();
DROP TRIGGER IF EXISTS saas_sensitive_mutation_audit ON public.movimentacoes_estoque;
CREATE TRIGGER saas_sensitive_mutation_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.movimentacoes_estoque
    FOR EACH ROW EXECUTE FUNCTION private.audit_saas_sensitive_mutation();

DROP TRIGGER IF EXISTS saas_sensitive_mutation_guard ON public.gastos_fixos;
CREATE TRIGGER saas_sensitive_mutation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.gastos_fixos
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_sensitive_mutation();
DROP TRIGGER IF EXISTS saas_sensitive_mutation_audit ON public.gastos_fixos;
CREATE TRIGGER saas_sensitive_mutation_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.gastos_fixos
    FOR EACH ROW EXECUTE FUNCTION private.audit_saas_sensitive_mutation();

DROP TRIGGER IF EXISTS saas_sensitive_mutation_guard ON public.gastos_variaveis;
CREATE TRIGGER saas_sensitive_mutation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.gastos_variaveis
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_sensitive_mutation();
DROP TRIGGER IF EXISTS saas_sensitive_mutation_audit ON public.gastos_variaveis;
CREATE TRIGGER saas_sensitive_mutation_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.gastos_variaveis
    FOR EACH ROW EXECUTE FUNCTION private.audit_saas_sensitive_mutation();

-- Perfis definem a autorização server-side e não podem ser alterados pela
-- chave publicável. A futura gestão de equipe deverá usar uma RPC autorizada.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.security_profiles
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.security_profiles TO authenticated;
DROP POLICY IF EXISTS company_insert ON public.security_profiles;
DROP POLICY IF EXISTS company_update ON public.security_profiles;
DROP POLICY IF EXISTS company_delete ON public.security_profiles;

-- Auditoria: cliente autenticado só consulta o tenant; eventos sensíveis são
-- inseridos pelo trigger SECURITY DEFINER e não podem ser alterados pelo cliente.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.security_audit_log
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.security_audit_log TO authenticated;
DROP POLICY IF EXISTS company_insert ON public.security_audit_log;
DROP POLICY IF EXISTS company_update ON public.security_audit_log;
DROP POLICY IF EXISTS company_delete ON public.security_audit_log;
