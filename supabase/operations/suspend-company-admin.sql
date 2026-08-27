BEGIN;

CREATE TEMP TABLE suspended_company_admin ON COMMIT DROP AS
WITH changed AS (
    UPDATE public.company_admin_identities
       SET ativo = false,
           suspended_at = now(),
           updated_at = now()
     WHERE auth_user_id = :'auth_user_id'::uuid
       AND ativo
    RETURNING auth_user_id, empresa_id, profile_id
)
SELECT * FROM changed;

SELECT 1 / CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM suspended_company_admin;

INSERT INTO public.security_audit_log (
    empresa_id,
    event_type,
    profile_id,
    profile_name,
    details,
    success
)
SELECT
    suspended.empresa_id,
    'SAAS_ADMIN_SUSPENDED',
    suspended.profile_id,
    profile.nome,
    jsonb_build_object('auth_user_id', suspended.auth_user_id)::text,
    true
FROM suspended_company_admin AS suspended
JOIN public.security_profiles AS profile
  ON profile.id = suspended.profile_id
 AND profile.empresa_id = suspended.empresa_id;

COMMIT;
