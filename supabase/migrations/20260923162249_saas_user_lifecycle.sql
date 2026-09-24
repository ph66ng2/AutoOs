-- Convites e ciclo de vida das identidades individuais SaaS.
-- Operações administrativas são chamadas somente por uma Edge Function com
-- service_role; auth.uid() continua sendo a autoridade para aceite do convite.

ALTER TABLE public.company_user_identities
    ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS invited_at timestamptz;

UPDATE public.company_user_identities
   SET lifecycle_status = CASE WHEN ativo THEN 'active' ELSE 'inactive' END;

ALTER TABLE public.company_user_identities
    DROP CONSTRAINT IF EXISTS chk_company_user_identity_suspension;
ALTER TABLE public.company_user_identities
    ADD CONSTRAINT chk_company_user_identity_lifecycle
    CHECK (
        (lifecycle_status = 'active' AND ativo AND suspended_at IS NULL)
        OR (lifecycle_status = 'pending' AND NOT ativo AND suspended_at IS NULL)
        OR (lifecycle_status = 'inactive' AND NOT ativo AND suspended_at IS NOT NULL)
    );
ALTER TABLE public.company_user_identities
    ADD CONSTRAINT chk_company_user_identity_lifecycle_status
    CHECK (lifecycle_status IN ('pending', 'active', 'inactive'));

CREATE OR REPLACE FUNCTION private.sync_company_user_identity_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
        CASE NEW.lifecycle_status
            WHEN 'active' THEN
                NEW.ativo := true;
                NEW.suspended_at := NULL;
            WHEN 'pending' THEN
                NEW.ativo := false;
                NEW.suspended_at := NULL;
            WHEN 'inactive' THEN
                NEW.ativo := false;
                NEW.suspended_at := COALESCE(NEW.suspended_at, now());
        END CASE;
    ELSIF TG_OP = 'INSERT' AND NEW.lifecycle_status = 'active' AND NOT NEW.ativo THEN
        IF NEW.suspended_at IS NULL THEN
            NEW.lifecycle_status := 'pending';
        ELSE
            NEW.lifecycle_status := 'inactive';
        END IF;
    ELSIF NEW.ativo THEN
        NEW.lifecycle_status := 'active';
        NEW.suspended_at := NULL;
    ELSIF NEW.suspended_at IS NOT NULL THEN
        NEW.lifecycle_status := 'inactive';
    ELSIF NEW.lifecycle_status <> 'pending' THEN
        NEW.lifecycle_status := 'inactive';
        NEW.suspended_at := now();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_company_user_identity_lifecycle
    ON public.company_user_identities;
CREATE TRIGGER trg_sync_company_user_identity_lifecycle
    BEFORE INSERT OR UPDATE OF ativo, lifecycle_status, suspended_at
    ON public.company_user_identities
    FOR EACH ROW
    EXECUTE FUNCTION private.sync_company_user_identity_lifecycle();

ALTER TABLE public.security_audit_log
    ADD COLUMN IF NOT EXISTS actor_auth_user_id uuid,
    ADD COLUMN IF NOT EXISTS target_auth_user_id uuid;

COMMENT ON COLUMN public.security_audit_log.actor_auth_user_id IS
    'Verified Supabase Auth actor for server-side SaaS user lifecycle events.';
COMMENT ON COLUMN public.security_audit_log.target_auth_user_id IS
    'Supabase Auth target for server-side SaaS user lifecycle events.';

CREATE OR REPLACE FUNCTION private.saas_admin_actor_context(p_actor_auth_user_id uuid)
RETURNS TABLE(empresa_id uuid, profile_id uuid, profile_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_actor_auth_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active company ADMIN required';
    END IF;

    SELECT individual.empresa_id, individual.profile_id, profile.nome
      INTO empresa_id, profile_id, profile_name
      FROM public.company_user_identities AS individual
      JOIN auth.users AS auth_user ON auth_user.id = individual.auth_user_id
      JOIN public.empresas AS company ON company.id = individual.empresa_id
      JOIN public.security_profiles AS profile
        ON profile.id = individual.profile_id
       AND profile.empresa_id = individual.empresa_id
     WHERE individual.auth_user_id = p_actor_auth_user_id
       AND individual.ativo
       AND individual.lifecycle_status = 'active'
       AND profile.role = 'ADMIN'
       AND COALESCE(profile.ativo, false)
       AND COALESCE(company.ativo, false)
       AND auth_user.email_confirmed_at IS NOT NULL
       AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= now());
    IF FOUND THEN
        RETURN NEXT;
        RETURN;
    END IF;

    -- A row in the individual table suppresses legacy fallback even while
    -- pending/inactive, so a suspended account cannot regain ADMIN authority.
    IF EXISTS (
        SELECT 1
          FROM public.company_user_identities AS individual
         WHERE individual.auth_user_id = p_actor_auth_user_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active company ADMIN required';
    END IF;

    SELECT legacy.empresa_id, legacy.profile_id, profile.nome
      INTO empresa_id, profile_id, profile_name
      FROM public.company_admin_identities AS legacy
      JOIN auth.users AS auth_user ON auth_user.id = legacy.auth_user_id
      JOIN public.empresas AS company ON company.id = legacy.empresa_id
      JOIN public.security_profiles AS profile
        ON profile.id = legacy.profile_id
       AND profile.empresa_id = legacy.empresa_id
     WHERE legacy.auth_user_id = p_actor_auth_user_id
       AND legacy.ativo
       AND profile.role = 'ADMIN'
       AND COALESCE(profile.ativo, false)
       AND COALESCE(company.ativo, false)
       AND auth_user.email_confirmed_at IS NOT NULL
       AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= now());
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Active company ADMIN required';
    END IF;

    RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION private.saas_active_admin_count(
    p_empresa_id uuid,
    p_excluded_auth_user_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT count(*)::integer
      FROM (
          SELECT individual.auth_user_id
            FROM public.company_user_identities AS individual
            JOIN public.security_profiles AS profile
              ON profile.id = individual.profile_id
             AND profile.empresa_id = individual.empresa_id
            JOIN auth.users AS auth_user ON auth_user.id = individual.auth_user_id
           WHERE individual.empresa_id = p_empresa_id
             AND individual.ativo
             AND individual.lifecycle_status = 'active'
             AND profile.role = 'ADMIN'
             AND COALESCE(profile.ativo, false)
             AND auth_user.email_confirmed_at IS NOT NULL
             AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= now())
             AND individual.auth_user_id IS DISTINCT FROM p_excluded_auth_user_id
          UNION ALL
          SELECT legacy.auth_user_id
            FROM public.company_admin_identities AS legacy
            JOIN public.security_profiles AS profile
              ON profile.id = legacy.profile_id
             AND profile.empresa_id = legacy.empresa_id
            JOIN auth.users AS auth_user ON auth_user.id = legacy.auth_user_id
           WHERE legacy.empresa_id = p_empresa_id
             AND legacy.ativo
             AND profile.role = 'ADMIN'
             AND COALESCE(profile.ativo, false)
             AND auth_user.email_confirmed_at IS NOT NULL
             AND (auth_user.banned_until IS NULL OR auth_user.banned_until <= now())
             AND legacy.auth_user_id IS DISTINCT FROM p_excluded_auth_user_id
             AND NOT EXISTS (
                 SELECT 1
                   FROM public.company_user_identities AS individual
                  WHERE individual.auth_user_id = legacy.auth_user_id
             )
      ) AS active_admins;
$$;

CREATE OR REPLACE FUNCTION private.write_saas_user_audit(
    p_empresa_id uuid,
    p_actor_auth_user_id uuid,
    p_target_auth_user_id uuid,
    p_event_type text,
    p_profile_id uuid,
    p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    INSERT INTO public.security_audit_log (
        empresa_id, event_type, profile_id, profile_name, details, success,
        actor_auth_user_id, target_auth_user_id
    )
    SELECT p_empresa_id,
           p_event_type,
           p_profile_id,
           profile.nome,
           COALESCE(p_details, '{}'::jsonb)::text,
           true,
           p_actor_auth_user_id,
           p_target_auth_user_id
      FROM (SELECT 1) AS singleton
      LEFT JOIN public.security_profiles AS profile
        ON profile.id = p_profile_id;
$$;

CREATE OR REPLACE FUNCTION public.saas_admin_prepare_invite(
    p_actor_auth_user_id uuid,
    p_email text,
    p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor record;
    target_profile record;
    normalized_email text := lower(btrim(COALESCE(p_email, '')));
    existing_user record;
BEGIN
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    PERFORM pg_advisory_xact_lock(hashtextextended(actor.empresa_id::text, 761913));
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);

    IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A valid email and active profile are required';
    END IF;

    SELECT profile.id, profile.role
      INTO target_profile
      FROM public.security_profiles AS profile
     WHERE profile.id = p_profile_id
       AND profile.empresa_id = actor.empresa_id
       AND COALESCE(profile.ativo, false);
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Target profile is not active in the actor company';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(normalized_email, 761913));
    SELECT auth_user.id, auth_user.email, auth_user.email_confirmed_at
      INTO existing_user
      FROM auth.users AS auth_user
     WHERE lower(auth_user.email) = normalized_email
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
        IF existing_user.email_confirmed_at IS NULL AND EXISTS (
            SELECT 1
              FROM public.company_user_identities AS identity
             WHERE identity.auth_user_id = existing_user.id
               AND identity.empresa_id = actor.empresa_id
               AND identity.profile_id = p_profile_id
               AND identity.lifecycle_status = 'pending'
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'An invitation is already pending; use resend_invite';
        END IF;
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'An Auth account already uses this email';
    END IF;

    RETURN jsonb_build_object('operation', 'create');
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_admin_list_company_users(p_actor_auth_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor record;
    users jsonb;
BEGIN
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'user_id', members.auth_user_id,
                'email', members.email,
                'profile_id', members.profile_id,
                'profile_name', members.profile_name,
                'profile_role', members.profile_role,
                'profile_active', members.profile_active,
                'status', members.lifecycle_status,
                'legacy_admin', members.legacy_admin,
                'invited_at', members.invited_at,
                'updated_at', members.updated_at
            ) ORDER BY lower(members.email), members.auth_user_id
        ),
        '[]'::jsonb
    )
      INTO users
      FROM (
          SELECT identity.auth_user_id,
                 auth_user.email,
                 identity.profile_id,
                 profile.nome AS profile_name,
                 profile.role AS profile_role,
                 COALESCE(profile.ativo, false) AS profile_active,
                 identity.lifecycle_status,
                 false AS legacy_admin,
                 identity.invited_at,
                 identity.updated_at
            FROM public.company_user_identities AS identity
            JOIN auth.users AS auth_user ON auth_user.id = identity.auth_user_id
            JOIN public.security_profiles AS profile
              ON profile.id = identity.profile_id
             AND profile.empresa_id = identity.empresa_id
           WHERE identity.empresa_id = actor.empresa_id
          UNION ALL
          SELECT legacy.auth_user_id,
                 auth_user.email,
                 legacy.profile_id,
                 profile.nome AS profile_name,
                 profile.role AS profile_role,
                 COALESCE(profile.ativo, false) AS profile_active,
                 CASE WHEN legacy.ativo THEN 'active' ELSE 'inactive' END AS lifecycle_status,
                 true AS legacy_admin,
                 NULL::timestamptz AS invited_at,
                 legacy.updated_at
            FROM public.company_admin_identities AS legacy
            JOIN auth.users AS auth_user ON auth_user.id = legacy.auth_user_id
            JOIN public.security_profiles AS profile
              ON profile.id = legacy.profile_id
             AND profile.empresa_id = legacy.empresa_id
           WHERE legacy.empresa_id = actor.empresa_id
             AND NOT EXISTS (
                 SELECT 1
                   FROM public.company_user_identities AS individual
                  WHERE individual.auth_user_id = legacy.auth_user_id
             )
      ) AS members;

    RETURN users;
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_admin_bind_invited_user(
    p_actor_auth_user_id uuid,
    p_target_auth_user_id uuid,
    p_email text,
    p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor record;
    target_account record;
    target_profile record;
    normalized_email text := lower(btrim(COALESCE(p_email, '')));
BEGIN
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    PERFORM pg_advisory_xact_lock(hashtextextended(actor.empresa_id::text, 761913));
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    PERFORM pg_advisory_xact_lock(hashtextextended(normalized_email, 761913));

    SELECT auth_row.id, auth_row.email, auth_row.email_confirmed_at
      INTO target_account
      FROM auth.users AS auth_row
     WHERE auth_row.id = p_target_auth_user_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'New unconfirmed Auth user does not match the invitation';
    END IF;
    IF target_account.email_confirmed_at IS NOT NULL
       OR lower(target_account.email) IS DISTINCT FROM normalized_email THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'New unconfirmed Auth user does not match the invitation';
    END IF;

    SELECT profile.id, profile.role
      INTO target_profile
      FROM public.security_profiles AS profile
     WHERE profile.id = p_profile_id
       AND profile.empresa_id = actor.empresa_id
       AND COALESCE(profile.ativo, false);
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Target profile is not active in the actor company';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.company_user_identities AS identity
         WHERE identity.auth_user_id = p_target_auth_user_id
    ) OR EXISTS (
        SELECT 1
          FROM public.company_admin_identities AS legacy
         WHERE legacy.auth_user_id = p_target_auth_user_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Auth user already has an AutoOS identity';
    END IF;

    INSERT INTO public.company_user_identities (
        auth_user_id, empresa_id, profile_id, ativo, lifecycle_status,
        invited_at, suspended_at, updated_at
    ) VALUES (
        p_target_auth_user_id, actor.empresa_id, p_profile_id, false, 'pending',
        now(), NULL, now()
    );

    PERFORM private.write_saas_user_audit(
        actor.empresa_id, p_actor_auth_user_id, p_target_auth_user_id,
        'SAAS_INVITE_CREATED', p_profile_id,
        jsonb_build_object('lifecycle_status', 'pending', 'profile_id', p_profile_id)
    );
    RETURN jsonb_build_object('auth_user_id', p_target_auth_user_id, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_admin_get_pending_invite(
    p_actor_auth_user_id uuid,
    p_target_auth_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor record;
    invitation record;
BEGIN
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    PERFORM pg_advisory_xact_lock(hashtextextended(actor.empresa_id::text, 761913));
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    SELECT identity.auth_user_id, auth_user.email
      INTO invitation
      FROM public.company_user_identities AS identity
      JOIN auth.users AS auth_user ON auth_user.id = identity.auth_user_id
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
     WHERE identity.auth_user_id = p_target_auth_user_id
       AND identity.empresa_id = actor.empresa_id
       AND identity.lifecycle_status = 'pending'
       AND auth_user.email_confirmed_at IS NULL
       AND COALESCE(profile.ativo, false);
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Pending invitation not found in actor company';
    END IF;
    RETURN jsonb_build_object(
        'auth_user_id', invitation.auth_user_id,
        'email', invitation.email
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_admin_record_invite_delivery(
    p_actor_auth_user_id uuid,
    p_target_auth_user_id uuid,
    p_event_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor record;
    target_identity record;
BEGIN
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    PERFORM pg_advisory_xact_lock(hashtextextended(actor.empresa_id::text, 761913));
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    IF p_event_type NOT IN ('SAAS_INVITE_SENT', 'SAAS_INVITE_RESENT') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid invitation audit event';
    END IF;
    SELECT identity.profile_id
      INTO target_identity
      FROM public.company_user_identities AS identity
      JOIN auth.users AS auth_user ON auth_user.id = identity.auth_user_id
     WHERE identity.auth_user_id = p_target_auth_user_id
       AND identity.empresa_id = actor.empresa_id
       AND identity.lifecycle_status = 'pending'
       AND auth_user.email_confirmed_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Pending invitation not found in actor company';
    END IF;
    PERFORM private.write_saas_user_audit(
        actor.empresa_id, p_actor_auth_user_id, p_target_auth_user_id,
        p_event_type, target_identity.profile_id,
        jsonb_build_object('lifecycle_status', 'pending')
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_admin_update_company_user(
    p_actor_auth_user_id uuid,
    p_target_auth_user_id uuid,
    p_action text,
    p_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor record;
    target_identity record;
    target_user record;
    new_profile record;
    event_type text;
    other_admin_count integer;
    changed boolean := true;
BEGIN
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    PERFORM pg_advisory_xact_lock(hashtextextended(actor.empresa_id::text, 761913));
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);

    SELECT identity.auth_user_id, identity.profile_id, identity.lifecycle_status,
           profile.role AS old_role
      INTO target_identity
      FROM public.company_user_identities AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
     WHERE identity.auth_user_id = p_target_auth_user_id
       AND identity.empresa_id = actor.empresa_id
     FOR UPDATE OF identity;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Target user not found in actor company';
    END IF;

    SELECT auth_user.id, auth_user.email_confirmed_at, auth_user.banned_until
      INTO target_user
      FROM auth.users AS auth_user
     WHERE auth_user.id = p_target_auth_user_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Target Auth user does not exist';
    END IF;

    CASE p_action
        WHEN 'change_profile' THEN
            IF p_profile_id IS NULL OR target_identity.lifecycle_status = 'inactive' THEN
                RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'An active profile and non-inactive user are required';
            END IF;
            SELECT profile.id, profile.role
              INTO new_profile
              FROM public.security_profiles AS profile
             WHERE profile.id = p_profile_id
               AND profile.empresa_id = actor.empresa_id
               AND COALESCE(profile.ativo, false);
            IF NOT FOUND THEN
                RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Target profile is not active in the actor company';
            END IF;
            IF target_identity.lifecycle_status = 'active'
               AND target_identity.old_role = 'ADMIN'
               AND new_profile.role <> 'ADMIN' THEN
                other_admin_count := private.saas_active_admin_count(actor.empresa_id, p_target_auth_user_id);
                IF other_admin_count < 1 THEN
                    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cannot remove the last active company ADMIN';
                END IF;
            END IF;
            IF target_identity.profile_id IS DISTINCT FROM p_profile_id THEN
                UPDATE public.company_user_identities
                   SET profile_id = p_profile_id, updated_at = now()
                 WHERE auth_user_id = p_target_auth_user_id;
                event_type := 'SAAS_USER_PROFILE_CHANGED';
            ELSE
                changed := false;
                event_type := 'SAAS_USER_PROFILE_CHANGE_RETRIED';
            END IF;
        WHEN 'deactivate' THEN
            IF target_identity.lifecycle_status = 'inactive' THEN
                changed := false;
                event_type := 'SAAS_USER_DEACTIVATION_RETRIED';
            ELSE
                IF target_identity.lifecycle_status = 'active'
                   AND target_identity.old_role = 'ADMIN' THEN
                    other_admin_count := private.saas_active_admin_count(actor.empresa_id, p_target_auth_user_id);
                    IF other_admin_count < 1 THEN
                        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Cannot deactivate the last active company ADMIN';
                    END IF;
                END IF;
                UPDATE public.company_user_identities
                   SET ativo = false, lifecycle_status = 'inactive',
                       suspended_at = now(), updated_at = now()
                 WHERE auth_user_id = p_target_auth_user_id;
                event_type := 'SAAS_USER_DEACTIVATED';
            END IF;
        WHEN 'reactivate' THEN
            IF target_user.email_confirmed_at IS NULL THEN
                RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only a confirmed user can be reactivated';
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM public.security_profiles AS profile
                 WHERE profile.id = target_identity.profile_id
                   AND profile.empresa_id = actor.empresa_id
                   AND COALESCE(profile.ativo, false)
            ) THEN
                RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'The user profile is inactive';
            END IF;
            IF target_identity.lifecycle_status = 'active' THEN
                changed := false;
                event_type := 'SAAS_USER_REACTIVATION_RETRIED';
            ELSIF target_identity.lifecycle_status = 'inactive' THEN
                UPDATE public.company_user_identities
                   SET ativo = true, lifecycle_status = 'active',
                       suspended_at = NULL, updated_at = now()
                 WHERE auth_user_id = p_target_auth_user_id;
                event_type := 'SAAS_USER_REACTIVATED';
            ELSE
                RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Pending users cannot be reactivated';
            END IF;
        ELSE
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Unsupported lifecycle action';
    END CASE;

    PERFORM private.write_saas_user_audit(
        actor.empresa_id, p_actor_auth_user_id, p_target_auth_user_id,
        event_type,
        CASE WHEN p_action = 'change_profile' THEN p_profile_id ELSE target_identity.profile_id END,
        jsonb_build_object(
            'action', p_action,
            'previous_status', target_identity.lifecycle_status,
            'status', CASE p_action WHEN 'deactivate' THEN 'inactive' WHEN 'reactivate' THEN 'active' ELSE target_identity.lifecycle_status END,
            'changed', changed,
            'previous_profile_id', target_identity.profile_id,
            'profile_id', CASE WHEN p_action = 'change_profile' THEN p_profile_id ELSE target_identity.profile_id END
        )
    );

    RETURN jsonb_build_object(
        'auth_user_id', p_target_auth_user_id,
        'status', CASE p_action WHEN 'deactivate' THEN 'inactive' WHEN 'reactivate' THEN 'active' ELSE target_identity.lifecycle_status END,
        'action', p_action,
        'changed', changed
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_company_user_invite()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor_auth_user_id uuid := auth.uid();
    invitation_company_id uuid;
    invitation record;
BEGIN
    IF actor_auth_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication required';
    END IF;

    SELECT identity.empresa_id
      INTO invitation_company_id
      FROM public.company_user_identities AS identity
     WHERE identity.auth_user_id = actor_auth_user_id
       AND identity.lifecycle_status IN ('pending', 'active');
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No confirmed pending AutoOS invitation';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(invitation_company_id::text, 761913));
    SELECT identity.auth_user_id, identity.empresa_id, identity.profile_id,
           identity.lifecycle_status, auth_user.email_confirmed_at,
           auth_user.banned_until, company.ativo AS company_active,
           profile.ativo AS profile_active
      INTO invitation
      FROM public.company_user_identities AS identity
      JOIN auth.users AS auth_user ON auth_user.id = identity.auth_user_id
      JOIN public.empresas AS company ON company.id = identity.empresa_id
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
     WHERE identity.auth_user_id = actor_auth_user_id
       AND identity.empresa_id = invitation_company_id
     FOR UPDATE OF identity;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No confirmed pending AutoOS invitation';
    END IF;
    IF invitation.email_confirmed_at IS NULL
       OR (invitation.banned_until IS NOT NULL AND invitation.banned_until > now())
       OR NOT COALESCE(invitation.company_active, false)
       OR NOT COALESCE(invitation.profile_active, false) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No confirmed pending AutoOS invitation';
    END IF;

    IF invitation.lifecycle_status = 'active' THEN
        RETURN jsonb_build_object('status', 'active', 'already_accepted', true);
    END IF;
    UPDATE public.company_user_identities
       SET ativo = true, lifecycle_status = 'active',
           suspended_at = NULL, updated_at = now()
     WHERE auth_user_id = actor_auth_user_id
       AND lifecycle_status = 'pending';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'Invitation state changed; retry acceptance';
    END IF;

    PERFORM private.write_saas_user_audit(
        invitation.empresa_id, actor_auth_user_id, actor_auth_user_id,
        'SAAS_INVITE_ACCEPTED', invitation.profile_id,
        jsonb_build_object('lifecycle_status', 'active', 'profile_id', invitation.profile_id)
    );
    RETURN jsonb_build_object('status', 'active');
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_admin_record_session_revocation(
    p_actor_auth_user_id uuid,
    p_target_auth_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    actor record;
    target_identity record;
BEGIN
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    PERFORM pg_advisory_xact_lock(hashtextextended(actor.empresa_id::text, 761913));
    SELECT * INTO STRICT actor
      FROM private.saas_admin_actor_context(p_actor_auth_user_id);
    SELECT identity.profile_id
      INTO target_identity
      FROM public.company_user_identities AS identity
     WHERE identity.auth_user_id = p_target_auth_user_id
       AND identity.empresa_id = actor.empresa_id
       AND identity.lifecycle_status = 'inactive';
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Inactive target user not found in actor company';
    END IF;
    PERFORM private.write_saas_user_audit(
        actor.empresa_id, p_actor_auth_user_id, p_target_auth_user_id,
        'SAAS_SESSIONS_REVOKED', target_identity.profile_id,
        jsonb_build_object('access_blocked_by_live_identity', true)
    );
END;
$$;

-- Pending invitees may exchange their invite link for a restricted session,
-- but receive no tenant/profile claims until their confirmed invite is accepted.
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
    pending_identity boolean := false;
    claims jsonb := COALESCE(event -> 'claims', '{}'::jsonb);
    app_metadata jsonb;
BEGIN
    IF requested_user_id IS NULL
       OR requested_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'AutoOS account is not authorized'));
    END IF;

    SELECT identity.empresa_id, identity.profile_id, profile.role
      INTO authoritative_company_id, authoritative_profile_id, authoritative_profile_role
      FROM public.company_user_identities AS identity
      JOIN public.empresas AS company ON company.id = identity.empresa_id
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
     WHERE identity.auth_user_id = requested_user_id::uuid
       AND identity.ativo
       AND identity.lifecycle_status = 'active'
       AND COALESCE(company.ativo, false)
       AND COALESCE(profile.ativo, false);

    IF NOT FOUND THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.company_user_identities AS identity
              JOIN public.empresas AS company ON company.id = identity.empresa_id
              JOIN public.security_profiles AS profile
                ON profile.id = identity.profile_id
               AND profile.empresa_id = identity.empresa_id
             WHERE identity.auth_user_id = requested_user_id::uuid
               AND identity.lifecycle_status = 'pending'
               AND COALESCE(company.ativo, false)
               AND COALESCE(profile.ativo, false)
        ) INTO pending_identity;

        IF pending_identity THEN
            app_metadata := CASE
                WHEN jsonb_typeof(claims -> 'app_metadata') = 'object' THEN claims -> 'app_metadata'
                ELSE '{}'::jsonb
            END;
            app_metadata := app_metadata
                - 'company_id' - 'profile_id' - 'profile_role' - 'autoos_invite_pending';
            app_metadata := app_metadata || jsonb_build_object('autoos_invite_pending', true);
            claims := jsonb_set(claims, '{app_metadata}', app_metadata, true);
            RETURN jsonb_build_object('claims', claims);
        END IF;

        IF EXISTS (
            SELECT 1 FROM public.company_user_identities AS identity
             WHERE identity.auth_user_id = requested_user_id::uuid
        ) THEN
            RETURN jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'AutoOS account is not authorized'));
        END IF;

        SELECT identity.empresa_id, identity.profile_id, profile.role
          INTO authoritative_company_id, authoritative_profile_id, authoritative_profile_role
          FROM public.company_admin_identities AS identity
          JOIN public.empresas AS company ON company.id = identity.empresa_id
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
        RETURN jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'AutoOS account is not authorized'));
    END IF;

    app_metadata := CASE
        WHEN jsonb_typeof(claims -> 'app_metadata') = 'object' THEN claims -> 'app_metadata'
        ELSE '{}'::jsonb
    END;
    app_metadata := app_metadata
        - 'company_id' - 'profile_id' - 'profile_role' - 'autoos_invite_pending';
    app_metadata := app_metadata || jsonb_build_object(
        'company_id', authoritative_company_id::text,
        'profile_id', authoritative_profile_id::text,
        'profile_role', authoritative_profile_role
    );
    claims := jsonb_set(claims, '{app_metadata}', app_metadata, true);
    RETURN jsonb_build_object('claims', claims);
END;
$$;

REVOKE ALL ON FUNCTION private.saas_admin_actor_context(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.saas_active_admin_count(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.write_saas_user_audit(uuid, uuid, uuid, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.saas_admin_actor_context(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.saas_active_admin_count(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.write_saas_user_audit(uuid, uuid, uuid, text, uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.saas_admin_prepare_invite(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_admin_list_company_users(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_admin_bind_invited_user(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_admin_get_pending_invite(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_admin_record_invite_delivery(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_admin_update_company_user(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.saas_admin_record_session_revocation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.saas_admin_prepare_invite(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_admin_list_company_users(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_admin_bind_invited_user(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_admin_get_pending_invite(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_admin_record_invite_delivery(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_admin_update_company_user(uuid, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.saas_admin_record_session_revocation(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.accept_company_user_invite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_company_user_invite() TO authenticated;

GRANT SELECT (lifecycle_status) ON TABLE public.company_user_identities TO supabase_auth_admin;
