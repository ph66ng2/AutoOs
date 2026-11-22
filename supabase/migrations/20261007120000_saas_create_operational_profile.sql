-- Criação de perfis operacionais SaaS por um administrador ativo da mesma empresa.
-- O PIN permanece no cofre local de cada dispositivo e não é enviado ao banco.
ALTER TABLE public.security_profiles
    DROP CONSTRAINT IF EXISTS security_profiles_nome_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.security_profiles'::regclass
           AND conname = 'uq_security_profiles_empresa_nome'
    ) THEN
        ALTER TABLE public.security_profiles
            ADD CONSTRAINT uq_security_profiles_empresa_nome UNIQUE (empresa_id, nome);
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_saas_operational_profile(
    p_name text,
    p_role text,
    p_permissions text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor record;
    normalized_name text := btrim(p_name);
    valid_permissions constant text[] := ARRAY[
        'CONFIG_SMTP', 'CONFIG_WHATSAPP', 'DELETE_RECORDS',
        'FINANCIAL_ACTIONS', 'STOCK_CONTROL', 'MANAGE_PROFILES', 'VIEW_EXPENSES'
    ];
    effective_permissions text[];
    new_profile_id uuid;
BEGIN
    SELECT * INTO actor
      FROM private.saas_admin_actor_context(auth.uid());

    IF actor.empresa_id IS NULL THEN
        RAISE EXCEPTION 'Active company ADMIN required' USING ERRCODE = '42501';
    END IF;
    IF normalized_name IS NULL OR length(normalized_name) < 3 OR length(normalized_name) > 80
       OR p_role NOT IN ('ADMIN', 'CUSTOM') OR p_role IS NULL THEN
        RAISE EXCEPTION 'Invalid operational profile' USING ERRCODE = '22023';
    END IF;
    IF p_permissions IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_permissions) AS permission
         WHERE permission IS NULL OR permission <> ALL(valid_permissions)
    ) THEN
        RAISE EXCEPTION 'Invalid profile permissions' USING ERRCODE = '22023';
    END IF;

    IF p_role = 'ADMIN' THEN
        effective_permissions := valid_permissions;
    ELSE
        SELECT array_agg(DISTINCT permission ORDER BY permission)
          INTO effective_permissions
          FROM unnest(p_permissions) AS permission;
        IF effective_permissions IS NULL THEN
            RAISE EXCEPTION 'Select at least one permission' USING ERRCODE = '22023';
        END IF;
    END IF;

    INSERT INTO public.security_profiles (empresa_id, nome, role, permissions, ativo, is_default)
    VALUES (actor.empresa_id, normalized_name, p_role, to_jsonb(effective_permissions)::text, true, false)
    RETURNING id INTO new_profile_id;

    INSERT INTO public.security_audit_log (
        empresa_id, event_type, profile_id, profile_name, details, success, actor_auth_user_id
    ) VALUES (
        actor.empresa_id, 'SAAS_OPERATIONAL_PROFILE_CREATED', new_profile_id,
        normalized_name, jsonb_build_object('role', p_role)::text, true, auth.uid()
    );

    RETURN new_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_saas_operational_profile(text, text, text[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_saas_operational_profile(text, text, text[])
    TO authenticated;
