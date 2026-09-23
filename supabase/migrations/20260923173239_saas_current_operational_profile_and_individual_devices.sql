-- A identidade SaaS efetiva é resolvida por auth.uid(), sessão viva e vínculo
-- atual; company/profile claims são apenas uma projeção assinada e podem estar
-- desatualizadas até o token ser renovado.
CREATE OR REPLACE FUNCTION private.current_saas_session_identity()
RETURNS TABLE (
    empresa_id uuid,
    profile_id uuid,
    auth_user_id uuid,
    session_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    WITH caller AS (
        SELECT
            (SELECT auth.uid()) AS auth_user_id,
            CASE
                WHEN COALESCE(
                    ((SELECT auth.jwt()) ->> 'session_id') ~*
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
                    false
                )
                THEN ((SELECT auth.jwt()) ->> 'session_id')::uuid
                ELSE NULL
            END AS session_id
    ),
    live_session AS (
        SELECT session.user_id AS auth_user_id, session.id AS session_id
          FROM auth.sessions AS session
          JOIN caller AS actor
            ON actor.auth_user_id = session.user_id
           AND actor.session_id = session.id
    ),
    active_identity AS (
        SELECT identity.empresa_id, identity.profile_id,
               live.auth_user_id, live.session_id, 1 AS priority
          FROM public.company_user_identities AS identity
          JOIN live_session AS live
            ON live.auth_user_id = identity.auth_user_id
          JOIN public.empresas AS company
            ON company.id = identity.empresa_id
          JOIN public.security_profiles AS profile
            ON profile.id = identity.profile_id
           AND profile.empresa_id = identity.empresa_id
         WHERE identity.ativo
           AND COALESCE(company.ativo, false)
           AND COALESCE(profile.ativo, false)

        UNION ALL

        SELECT identity.empresa_id, identity.profile_id,
               live.auth_user_id, live.session_id, 2 AS priority
          FROM public.company_admin_identities AS identity
          JOIN live_session AS live
            ON live.auth_user_id = identity.auth_user_id
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
                 WHERE individual.auth_user_id = live.auth_user_id
           )
    )
    SELECT active.empresa_id, active.profile_id,
           active.auth_user_id, active.session_id
      FROM active_identity AS active
     ORDER BY active.priority
     LIMIT 1;
$$;

COMMENT ON FUNCTION private.current_saas_session_identity() IS
    'Returns the caller current active tenant/profile only when auth.uid() and JWT session_id match a live auth.sessions row.';

REVOKE ALL ON FUNCTION private.current_saas_session_identity()
    FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_saas_session_identity()
    TO authenticated;

-- Tenant checks also reject already-issued access JWTs after their refresh
-- session has been revoked, including after the account is later reactivated.
CREATE OR REPLACE FUNCTION private.authorized_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT identity.empresa_id
      FROM private.current_saas_session_identity() AS identity
     LIMIT 1;
$$;

REVOKE ALL ON FUNCTION private.authorized_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.authorized_company_id() TO authenticated;

-- Public RPC is SECURITY INVOKER; it exposes only the caller's current profile
-- and still observes the security_profiles SELECT grant and tenant RLS policy.
CREATE OR REPLACE FUNCTION public.get_current_saas_operational_profile()
RETURNS TABLE (
    profile_id uuid,
    empresa_id uuid,
    nome text,
    role text,
    permissions jsonb
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT identity.profile_id, identity.empresa_id,
           profile.nome, profile.role, profile.permissions::jsonb
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
     WHERE profile.ativo IS TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_current_saas_operational_profile()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_saas_operational_profile()
    TO authenticated;

-- Device registration/revocation now accepts individual active bindings as
-- well as the legacy ADMIN binding. Company, user and session are all live
-- server-side values; the desktop sends only the installation marker.
CREATE OR REPLACE FUNCTION public.autoos_device_claims()
RETURNS TABLE (empresa_id uuid, auth_user_id uuid, session_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT identity.empresa_id, identity.auth_user_id, identity.session_id
      FROM private.current_saas_session_identity() AS identity
     LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.autoos_device_claims()
    FROM PUBLIC, anon, authenticated;

-- Revoking an installation also removes its Auth session in the same database
-- transaction. The RLS session check above then rejects outstanding access
-- JWTs immediately, not only after their exp timestamp.
CREATE OR REPLACE FUNCTION public.revoke_current_autoos_device(
    p_device_id uuid,
    p_reason text DEFAULT 'removed_by_administrator'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    authoritative record;
BEGIN
    SELECT * INTO authoritative FROM public.autoos_device_claims();
    UPDATE public.saas_devices
       SET status = 'revoked',
           revoked_at = now(),
           revoked_reason = left(COALESCE(NULLIF(btrim(p_reason), ''), 'removed_by_administrator'), 120)
     WHERE device_id = p_device_id
       AND empresa_id = authoritative.empresa_id
       AND auth_user_id = authoritative.auth_user_id
       AND session_id = authoritative.session_id
       AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AutoOS device is not active for this session' USING ERRCODE = '42501';
    END IF;

    DELETE FROM auth.sessions
     WHERE id = authoritative.session_id
       AND user_id = authoritative.auth_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AutoOS Auth session is no longer active' USING ERRCODE = '42501';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_current_autoos_device(uuid, text)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_current_autoos_device(uuid, text)
    TO authenticated;
