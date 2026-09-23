-- Vínculo server-side de logins SaaS individuais a uma empresa e perfil AutoOS.
-- company_admin_identities permanece como fallback transitório para os ADMIN
-- existentes; usuário sem vínculo geral continua elegível somente se possuir
-- um vínculo ADMIN legado ativo e válido.

CREATE TABLE public.company_user_identities (
    auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    profile_id uuid NOT NULL,
    ativo boolean NOT NULL DEFAULT true,
    provisioned_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    suspended_at timestamptz,
    CONSTRAINT fk_company_user_identity_profile_empresa
        FOREIGN KEY (empresa_id, profile_id)
        REFERENCES public.security_profiles(empresa_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT chk_company_user_identity_suspension
        CHECK ((ativo AND suspended_at IS NULL) OR (NOT ativo AND suspended_at IS NOT NULL))
);

COMMENT ON TABLE public.company_user_identities IS
    'Server-only binding between an individual Supabase Auth user, one company and one AutoOS security profile.';
COMMENT ON COLUMN public.company_user_identities.auth_user_id IS
    'References auth.users; never supplied by an AutoOS client.';

CREATE UNIQUE INDEX ux_company_user_identity_active_profile
    ON public.company_user_identities (empresa_id, profile_id)
    WHERE ativo;
CREATE INDEX idx_company_user_identities_empresa
    ON public.company_user_identities (empresa_id);
CREATE INDEX idx_company_user_identities_active_lookup
    ON public.company_user_identities (auth_user_id, empresa_id)
    WHERE ativo;

ALTER TABLE public.company_user_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.company_user_identities FROM PUBLIC, anon, authenticated;

-- RLS consulta a identidade atual por auth.uid() em cada request; não depende
-- das claims do JWT, que podem estar ausentes ou ter sido emitidas antes de uma
-- alteração/inativação de vínculo.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.authorized_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH caller AS (
        SELECT (SELECT auth.uid()) AS id
    ),
    active_binding AS (
        SELECT identity.empresa_id
          FROM public.company_user_identities AS identity
          JOIN caller AS actor
            ON identity.auth_user_id = actor.id
          JOIN public.empresas AS company
            ON company.id = identity.empresa_id
          JOIN public.security_profiles AS profile
            ON profile.id = identity.profile_id
           AND profile.empresa_id = identity.empresa_id
         WHERE identity.ativo
           AND COALESCE(company.ativo, false)
           AND COALESCE(profile.ativo, false)

        UNION ALL

        SELECT identity.empresa_id
          FROM public.company_admin_identities AS identity
          JOIN caller AS actor
            ON identity.auth_user_id = actor.id
          JOIN public.empresas AS company
            ON company.id = identity.empresa_id
          JOIN public.security_profiles AS profile
            ON profile.id = identity.profile_id
           AND profile.empresa_id = identity.empresa_id
         WHERE identity.ativo
           AND COALESCE(company.ativo, false)
           AND COALESCE(profile.ativo, false)
           AND profile.role = 'ADMIN'
           AND NOT EXISTS (
               SELECT 1
                 FROM public.company_user_identities AS individual
                WHERE individual.auth_user_id = actor.id
           )
    )
    SELECT empresa_id
      FROM active_binding
     LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.authorized_company_id() FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.authorized_company_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT private.authorized_company_id();
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

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
    authoritative_profile_role text;
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

    SELECT identity.empresa_id, identity.profile_id, profile.role
      INTO authoritative_company_id, authoritative_profile_id, authoritative_profile_role
      FROM public.company_user_identities AS identity
      JOIN public.empresas AS company
        ON company.id = identity.empresa_id
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
     WHERE identity.auth_user_id = requested_user_id::uuid
       AND identity.ativo
       AND COALESCE(company.ativo, false)
       AND COALESCE(profile.ativo, false);

    IF NOT FOUND THEN
        -- A row in the individual table, even inactive or invalid, suppresses
        -- the legacy ADMIN fallback so revocation cannot resurrect old access.
        IF EXISTS (
            SELECT 1
              FROM public.company_user_identities AS identity
             WHERE identity.auth_user_id = requested_user_id::uuid
        ) THEN
            RETURN jsonb_build_object(
                'error', jsonb_build_object(
                    'http_code', 403,
                    'message', 'AutoOS account is not authorized'
                )
            );
        END IF;

        SELECT identity.empresa_id, identity.profile_id, profile.role
          INTO authoritative_company_id, authoritative_profile_id, authoritative_profile_role
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
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', jsonb_build_object(
                'http_code', 403,
                'message', 'AutoOS account is not authorized'
            )
        );
    END IF;

    -- Authorization claims are replaced from the private server-side binding.
    -- Neither user_metadata nor authorization-looking input claims are read.
    app_metadata := CASE
        WHEN jsonb_typeof(claims -> 'app_metadata') = 'object'
            THEN claims -> 'app_metadata'
        ELSE '{}'::jsonb
    END;
    app_metadata := app_metadata
        - 'company_id'
        - 'profile_id'
        - 'profile_role';
    app_metadata := app_metadata || jsonb_build_object(
        'company_id', authoritative_company_id::text,
        'profile_id', authoritative_profile_id::text,
        'profile_role', authoritative_profile_role
    );
    claims := jsonb_set(claims, '{app_metadata}', app_metadata, true);

    RETURN jsonb_build_object('claims', claims);
END;
$$;

COMMENT ON FUNCTION public.autoos_custom_access_token_hook(jsonb) IS
    'Supabase Auth hook that injects current company/profile claims from an individual binding or the legacy ADMIN binding.';

REVOKE ALL ON FUNCTION public.autoos_custom_access_token_hook(jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.autoos_custom_access_token_hook(jsonb)
    TO supabase_auth_admin;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT (auth_user_id, empresa_id, profile_id, ativo)
    ON TABLE public.company_user_identities TO supabase_auth_admin;
GRANT SELECT (auth_user_id, empresa_id, profile_id, ativo)
    ON TABLE public.company_admin_identities TO supabase_auth_admin;
GRANT SELECT (id, ativo) ON TABLE public.empresas TO supabase_auth_admin;
GRANT SELECT (id, empresa_id, role, ativo)
    ON TABLE public.security_profiles TO supabase_auth_admin;

CREATE POLICY auth_hook_select ON public.company_user_identities
    FOR SELECT TO supabase_auth_admin
    USING (true);
