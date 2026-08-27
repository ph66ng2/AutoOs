BEGIN;

CREATE TEMP TABLE reactivated_company_admin ON COMMIT DROP AS
WITH changed AS (
    UPDATE public.company_admin_identities AS identity
       SET ativo = true,
           suspended_at = NULL,
           updated_at = now()
      FROM public.empresas AS company,
           public.security_profiles AS profile
     WHERE identity.auth_user_id = :'auth_user_id'::uuid
       AND NOT identity.ativo
       AND company.id = identity.empresa_id
       AND profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND COALESCE(company.ativo, false)
       AND COALESCE(profile.ativo, false)
       AND profile.role = 'ADMIN'
    RETURNING identity.auth_user_id, identity.empresa_id, identity.profile_id
)
SELECT * FROM changed;

SELECT 1 / CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM reactivated_company_admin;

INSERT INTO public.security_audit_log (
    empresa_id,
    event_type,
    profile_id,
    profile_name,
    details,
    success
)
SELECT
    reactivated.empresa_id,
    'SAAS_ADMIN_REACTIVATED',
    reactivated.profile_id,
    profile.nome,
    jsonb_build_object('auth_user_id', reactivated.auth_user_id)::text,
    true
FROM reactivated_company_admin AS reactivated
JOIN public.security_profiles AS profile
  ON profile.id = reactivated.profile_id
 AND profile.empresa_id = reactivated.empresa_id;

COMMIT;
