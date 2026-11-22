-- Identidade autoritativa do administrador SaaS inicial.
--
-- Esta tabela e o hook são exclusivamente server-side. O cliente recebe apenas
-- o JWT emitido pelo Supabase; nunca recebe secret key/service_role nem escolhe
-- company_id/profile_id.

CREATE TABLE public.company_admin_identities (
    auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL,
    ativo boolean NOT NULL DEFAULT true,
    provisioned_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    suspended_at timestamptz,
    CONSTRAINT uq_company_admin_identity_profile UNIQUE (profile_id),
    CONSTRAINT fk_company_admin_identity_profile_empresa
        FOREIGN KEY (empresa_id, profile_id)
        REFERENCES public.security_profiles(empresa_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_company_admin_identity_suspension
        CHECK ((ativo AND suspended_at IS NULL) OR (NOT ativo AND suspended_at IS NOT NULL))
);

COMMENT ON TABLE public.company_admin_identities IS
    'Server-only binding between a Supabase Auth user, one company and one ADMIN profile.';
COMMENT ON COLUMN public.company_admin_identities.auth_user_id IS
    'References auth.users; never supplied by an AutoOS client.';

CREATE INDEX idx_company_admin_identities_empresa
    ON public.company_admin_identities (empresa_id);
CREATE INDEX idx_company_admin_identities_active_lookup
    ON public.company_admin_identities (auth_user_id, empresa_id)
    WHERE ativo;

ALTER TABLE public.company_admin_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.company_admin_identities FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.autoos_custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    requested_user_id text := event ->> 'user_id';
    authoritative_company_id uuid;
    authoritative_profile_id uuid;
    claims jsonb := COALESCE(event -> 'claims', '{}'::jsonb);
    app_metadata jsonb;
BEGIN
    IF requested_user_id IS NULL
       OR requested_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object(
            'error', jsonb_build_object(
                'http_code', 403,
                'message', 'AutoOS account is not authorized'
            )
        );
    END IF;

    SELECT identity.empresa_id, identity.profile_id
      INTO authoritative_company_id, authoritative_profile_id
      FROM public.company_admin_identities AS identity
      JOIN public.empresas AS company
        ON company.id = identity.empresa_id
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
     WHERE identity.auth_user_id = requested_user_id::uuid
       AND identity.ativo
       AND COALESCE(company.ativo, false)
       AND COALESCE(profile.ativo, false)
       AND profile.role = 'ADMIN';

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', jsonb_build_object(
                'http_code', 403,
                'message', 'AutoOS account is not authorized'
            )
        );
    END IF;

    -- Claims de entrada e user_metadata não são fontes de autorização. Valores
    -- de tenant/perfil são sempre substituídos pelo vínculo server-side.
    app_metadata := COALESCE(claims -> 'app_metadata', '{}'::jsonb)
        - 'company_id'
        - 'profile_id'
        - 'profile_role';
    app_metadata := app_metadata || jsonb_build_object(
        'company_id', authoritative_company_id::text,
        'profile_id', authoritative_profile_id::text,
        'profile_role', 'ADMIN'
    );
    claims := jsonb_set(claims, '{app_metadata}', app_metadata, true);

    RETURN jsonb_build_object('claims', claims);
END;
$$;

COMMENT ON FUNCTION public.autoos_custom_access_token_hook(jsonb) IS
    'Supabase Auth hook that injects authoritative AutoOS tenant/profile claims.';

REVOKE ALL ON FUNCTION public.autoos_custom_access_token_hook(jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autoos_custom_access_token_hook(jsonb)
    TO supabase_auth_admin;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT (auth_user_id, empresa_id, profile_id, ativo)
    ON TABLE public.company_admin_identities TO supabase_auth_admin;
GRANT SELECT (id, ativo) ON TABLE public.empresas TO supabase_auth_admin;
GRANT SELECT (id, empresa_id, role, ativo)
    ON TABLE public.security_profiles TO supabase_auth_admin;

CREATE POLICY auth_hook_select ON public.company_admin_identities
    FOR SELECT TO supabase_auth_admin
    USING (true);
CREATE POLICY auth_hook_select ON public.empresas
    FOR SELECT TO supabase_auth_admin
    USING (true);
CREATE POLICY auth_hook_select ON public.security_profiles
    FOR SELECT TO supabase_auth_admin
    USING (true);
