-- Perfis operacionais do SaaS: a empresa vem exclusivamente da sessão validada.
-- Esta função é SECURITY INVOKER para manter RLS como a camada de autorização.
CREATE OR REPLACE FUNCTION public.list_active_saas_operational_profiles()
RETURNS TABLE (profile_id uuid, nome text, role text, permissions jsonb)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.id, p.nome, p.role, p.permissions::jsonb
    FROM public.security_profiles AS p
   WHERE p.empresa_id = public.current_company_id()
     AND p.ativo = true
   ORDER BY p.nome ASC, p.id ASC;
$$;

REVOKE ALL ON FUNCTION public.list_active_saas_operational_profiles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_active_saas_operational_profiles() TO authenticated;

-- A seleção é auditável, mas não é prova de identidade individual: a prova
-- continua sendo a conta ADMIN autenticada no Supabase registrada no detalhe.
CREATE OR REPLACE FUNCTION public.audit_saas_operational_profile_selection(p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_profile public.security_profiles%ROWTYPE;
  company_id uuid := public.current_company_id();
BEGIN
  SELECT * INTO selected_profile
    FROM public.security_profiles
   WHERE id = p_profile_id
     AND empresa_id = company_id
     AND ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil operacional SaaS não autorizado' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.security_audit_log (empresa_id, event_type, profile_id, profile_name, details, success)
  VALUES (
    company_id,
    'SAAS_OPERATIONAL_PROFILE_SELECTED',
    selected_profile.id,
    selected_profile.nome,
    jsonb_build_object(
      'actor_auth_user_id', auth.uid(),
      'evidence', 'cloud_admin_selected_local_operational_profile'
    )::text,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.audit_saas_operational_profile_selection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_saas_operational_profile_selection(uuid) TO authenticated;
