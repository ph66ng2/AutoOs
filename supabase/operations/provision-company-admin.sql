BEGIN;

CREATE TEMP TABLE provisioned_company_admin ON COMMIT DROP AS
WITH inserted AS (
    INSERT INTO public.company_admin_identities (
        auth_user_id,
        empresa_id,
        profile_id
    )
    SELECT
        :'auth_user_id'::uuid,
        company.id,
        profile.id
    FROM public.empresas AS company
    JOIN public.security_profiles AS profile
      ON profile.empresa_id = company.id
    WHERE company.id = :'empresa_id'::uuid
      AND profile.id = :'profile_id'::uuid
      AND COALESCE(company.ativo, false)
      AND COALESCE(profile.ativo, false)
      AND profile.role = 'ADMIN'
    RETURNING auth_user_id, empresa_id, profile_id
)
SELECT * FROM inserted;

-- Falha a transação quando empresa/perfil não existem, estão inativos ou o
-- perfil não é ADMIN. O script remove o auth.users recém-criado como compensação.
SELECT 1 / CASE WHEN COUNT(*) = 1 THEN 1 ELSE 0 END
FROM provisioned_company_admin;

INSERT INTO public.security_audit_log (
    empresa_id,
    event_type,
    profile_id,
    profile_name,
    details,
    success
)
SELECT
    provisioned.empresa_id,
    'SAAS_ADMIN_PROVISIONED',
    provisioned.profile_id,
    profile.nome,
    jsonb_build_object('auth_user_id', provisioned.auth_user_id)::text,
    true
FROM provisioned_company_admin AS provisioned
JOIN public.security_profiles AS profile
  ON profile.id = provisioned.profile_id
 AND profile.empresa_id = provisioned.empresa_id;

COMMIT;
