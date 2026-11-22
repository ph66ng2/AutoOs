-- AO-AUTH-003: registro e revogação de instalações SaaS.
--
-- O UUID da instalação é criado localmente pelo desktop, mas empresa, usuário
-- e session_id são sempre derivados do JWT validado pelo Supabase. A tabela
-- não é exposta ao Data API: clientes autenticados usam somente as RPCs abaixo.

CREATE TABLE public.saas_devices (
    device_id uuid PRIMARY KEY,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id uuid NOT NULL,
    installation_name text NOT NULL DEFAULT 'AutoOS Desktop',
    status text NOT NULL DEFAULT 'active',
    registered_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    revoked_reason text,
    CONSTRAINT chk_saas_devices_status CHECK (status IN ('active', 'revoked')),
    CONSTRAINT chk_saas_devices_revocation CHECK (
        (status = 'active' AND revoked_at IS NULL AND revoked_reason IS NULL)
        OR (status = 'revoked' AND revoked_at IS NOT NULL)
    ),
    CONSTRAINT chk_saas_devices_installation_name CHECK (
        char_length(btrim(installation_name)) BETWEEN 1 AND 120
    )
);

COMMENT ON TABLE public.saas_devices IS
    'Server-side installation registry. Tenant/user/session are derived from the validated JWT, never from desktop payload.';

CREATE INDEX idx_saas_devices_active_company_user
    ON public.saas_devices (empresa_id, auth_user_id, last_seen_at DESC)
    WHERE status = 'active';
CREATE INDEX idx_saas_devices_active_session
    ON public.saas_devices (session_id)
    WHERE status = 'active';

ALTER TABLE public.saas_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.saas_devices FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.autoos_device_claims()
RETURNS TABLE (empresa_id uuid, auth_user_id uuid, session_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    jwt_claims jsonb := auth.jwt();
    claimed_company_id uuid;
    claimed_session_id uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'AutoOS device authentication is required' USING ERRCODE = '42501';
    END IF;

    BEGIN
        claimed_company_id := (jwt_claims -> 'app_metadata' ->> 'company_id')::uuid;
        claimed_session_id := (jwt_claims ->> 'session_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'AutoOS device session is invalid' USING ERRCODE = '42501';
    END;

    IF claimed_company_id IS NULL OR claimed_session_id IS NULL THEN
        RAISE EXCEPTION 'AutoOS device session is invalid' USING ERRCODE = '42501';
    END IF;

    PERFORM 1
      FROM public.company_admin_identities AS identity
      JOIN public.empresas AS company ON company.id = identity.empresa_id
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
     WHERE identity.auth_user_id = auth.uid()
       AND identity.empresa_id = claimed_company_id
       AND identity.ativo
       AND COALESCE(company.ativo, false)
       AND COALESCE(profile.ativo, false)
       AND profile.role = 'ADMIN';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AutoOS device authorization is unavailable' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT claimed_company_id, auth.uid(), claimed_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.autoos_device_claims() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_autoos_device(
    p_device_id uuid,
    p_installation_name text DEFAULT 'AutoOS Desktop'
)
RETURNS TABLE (device_id uuid, status text, registered_at timestamptz, last_seen_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    authoritative record;
    safe_name text := btrim(COALESCE(p_installation_name, ''));
BEGIN
    IF p_device_id IS NULL OR char_length(safe_name) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'AutoOS device payload is invalid' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO authoritative FROM public.autoos_device_claims();

    INSERT INTO public.saas_devices AS device (
        device_id, empresa_id, auth_user_id, session_id, installation_name
    ) VALUES (
        p_device_id, authoritative.empresa_id, authoritative.auth_user_id,
        authoritative.session_id, safe_name
    )
    ON CONFLICT ON CONSTRAINT saas_devices_pkey DO UPDATE
      SET session_id = EXCLUDED.session_id,
          installation_name = EXCLUDED.installation_name,
          last_seen_at = now()
      WHERE device.empresa_id = EXCLUDED.empresa_id
        AND device.auth_user_id = EXCLUDED.auth_user_id
        AND device.status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'AutoOS device is not available for this session' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
      SELECT device.device_id, device.status, device.registered_at, device.last_seen_at
        FROM public.saas_devices AS device
       WHERE device.device_id = p_device_id;
END;
$$;

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
       SET status = 'revoked', revoked_at = now(), revoked_reason = left(COALESCE(NULLIF(btrim(p_reason), ''), 'removed_by_administrator'), 120)
     WHERE device_id = p_device_id
       AND empresa_id = authoritative.empresa_id
       AND auth_user_id = authoritative.auth_user_id
       AND session_id = authoritative.session_id
       AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AutoOS device is not active for this session' USING ERRCODE = '42501';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_active_autoos_device(p_device_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    authoritative record;
BEGIN
    SELECT * INTO authoritative FROM public.autoos_device_claims();
    PERFORM 1 FROM public.saas_devices
     WHERE device_id = p_device_id
       AND empresa_id = authoritative.empresa_id
       AND auth_user_id = authoritative.auth_user_id
       AND session_id = authoritative.session_id
       AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'AutoOS device is revoked or unavailable' USING ERRCODE = '42501';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.register_autoos_device(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_current_autoos_device(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assert_active_autoos_device(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_autoos_device(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_current_autoos_device(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_active_autoos_device(uuid) TO authenticated;
