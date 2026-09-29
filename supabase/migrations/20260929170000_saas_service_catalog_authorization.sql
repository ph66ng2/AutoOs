-- Catálogo de serviços: o PostgREST pode chamar a tabela diretamente, então a
-- permissão e a auditoria precisam ser aplicadas dentro do banco.
CREATE OR REPLACE FUNCTION private.saas_service_catalog_required_permission(
    p_operation text,
    p_old jsonb,
    p_new jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_operation = 'DELETE' THEN 'DELETE_RECORDS'
        WHEN p_operation = 'UPDATE'
             AND p_new ->> 'ativo' = 'false'
             AND p_old ->> 'ativo' IS DISTINCT FROM p_new ->> 'ativo'
            THEN 'DELETE_RECORDS'
        ELSE 'STOCK_CONTROL'
    END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_saas_service_catalog_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
    new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
    required_permission text;
BEGIN
    IF private.saas_is_trusted_maintenance_session() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    required_permission := private.saas_service_catalog_required_permission(
        TG_OP, old_row, new_row
    );
    IF NOT private.saas_has_permission(required_permission) THEN
        RAISE LOG 'AUTOOS_SAAS_AUTHZ_DENIED auth_user_id=% tenant_id=% action=servicos_catalogo.% required=% result=denied at=%',
            (SELECT identity.auth_user_id FROM private.current_saas_session_identity() AS identity LIMIT 1),
            (SELECT identity.empresa_id FROM private.current_saas_session_identity() AS identity LIMIT 1),
            TG_OP,
            required_permission,
            clock_timestamp();
        RAISE EXCEPTION 'Not authorized for this SaaS operation; required permission: %',
            required_permission
            USING ERRCODE = '42501';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION private.audit_saas_service_catalog_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    old_row jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
    new_row jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
    actor record;
    required_permission text;
    event_details jsonb;
BEGIN
    IF private.saas_is_trusted_maintenance_session() THEN
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

    required_permission := private.saas_service_catalog_required_permission(
        TG_OP, old_row, new_row
    );
    event_details := jsonb_build_object(
        'table', TG_TABLE_NAME,
        'operation', TG_OP,
        'record_id', COALESCE(new_row ->> 'id', old_row ->> 'id'),
        'required_permissions', jsonb_build_array(required_permission),
        'old_active', old_row ->> 'ativo',
        'new_active', new_row ->> 'ativo'
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

REVOKE ALL ON FUNCTION private.saas_service_catalog_required_permission(text, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.enforce_saas_service_catalog_mutation()
    FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.audit_saas_service_catalog_mutation()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS saas_service_catalog_mutation_guard ON public.servicos_catalogo;
CREATE TRIGGER saas_service_catalog_mutation_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.servicos_catalogo
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_service_catalog_mutation();
DROP TRIGGER IF EXISTS saas_service_catalog_mutation_audit ON public.servicos_catalogo;
CREATE TRIGGER saas_service_catalog_mutation_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.servicos_catalogo
    FOR EACH ROW EXECUTE FUNCTION private.audit_saas_service_catalog_mutation();
