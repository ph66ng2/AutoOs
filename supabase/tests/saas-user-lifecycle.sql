-- Requer as duas empresas e os dois ADMIN sintéticos do harness local.
-- Todas as mudanças são transacionais e terminam em ROLLBACK.
BEGIN;

DO $$
BEGIN
    IF NOT has_function_privilege(
        'service_role', 'public.saas_admin_prepare_invite(uuid,text,uuid)', 'EXECUTE'
    ) OR has_function_privilege(
        'authenticated', 'public.saas_admin_prepare_invite(uuid,text,uuid)', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'admin invite RPC is not restricted to service_role';
    END IF;
    IF NOT has_function_privilege(
        'authenticated', 'public.accept_company_user_invite()', 'EXECUTE'
    ) OR has_function_privilege(
        'anon', 'public.accept_company_user_invite()', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'invite acceptance is not restricted to authenticated users';
    END IF;
END;
$$;

INSERT INTO public.security_profiles (
    id, empresa_id, nome, role, permissions, ativo, is_default
) VALUES
    ('a0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000001', 'AO-LIFECYCLE-ADMIN-C', 'ADMIN', '[]', true, false),
    ('a0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001', 'AO-LIFECYCLE-EMPLOYEE-D', 'TECNICO', '[]', true, false);

INSERT INTO public.company_user_identities (
    auth_user_id, empresa_id, profile_id, ativo, lifecycle_status, suspended_at
) VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'a0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000011', true, 'active', NULL
);

DO $$
DECLARE
    invite_result jsonb;
    pending_hook jsonb;
BEGIN
    invite_result := public.saas_admin_prepare_invite(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'ADMIN-C@EXAMPLE.INVALID',
        'a0000000-0000-4000-8000-000000000013'
    );
    IF invite_result ->> 'operation' IS DISTINCT FROM 'create' THEN
        RAISE EXCEPTION 'valid admin invite preflight did not resolve to create';
    END IF;

    BEGIN
        PERFORM public.saas_admin_prepare_invite(
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'cross-tenant@example.invalid',
            'b0000000-0000-4000-8000-000000000011'
        );
        RAISE EXCEPTION 'cross-tenant target profile was accepted';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        PERFORM public.saas_admin_prepare_invite(
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'cross-company@example.invalid',
            'a0000000-0000-4000-8000-000000000013'
        );
        RAISE EXCEPTION 'ADMIN from another company was allowed to target tenant A';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
        ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'admin-c@example.invalid', NULL);
    INSERT INTO auth.sessions (id, user_id) VALUES
        ('a0000000-0000-4000-8000-000000000093', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    PERFORM public.saas_admin_bind_invited_user(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'admin-c@example.invalid',
        'a0000000-0000-4000-8000-000000000013'
    );

    pending_hook := public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'claims', jsonb_build_object(
            'app_metadata', jsonb_build_object(
                'company_id', 'b0000000-0000-4000-8000-000000000001',
                'profile_id', 'b0000000-0000-4000-8000-000000000011',
                'profile_role', 'ADMIN'
            ),
            'user_metadata', jsonb_build_object('company_id', 'b0000000-0000-4000-8000-000000000001')
        )
    ));
    IF pending_hook #>> '{claims,app_metadata,autoos_invite_pending}' IS DISTINCT FROM 'true'
       OR pending_hook #> '{claims,app_metadata}' ? 'company_id'
       OR pending_hook #> '{claims,app_metadata}' ? 'profile_id' THEN
        RAISE EXCEPTION 'pending invite token contains tenant/profile authority: %', pending_hook;
    END IF;

    IF (SELECT lifecycle_status FROM public.company_user_identities
        WHERE auth_user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') <> 'pending' THEN
        RAISE EXCEPTION 'new invite did not remain pending before confirmation';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated","session_id":"a0000000-0000-4000-8000-000000000093"}', true);
DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'pending invite session received tenant access';
    END IF;
END;
$$;
RESET ROLE;

UPDATE auth.users
   SET email_confirmed_at = now()
 WHERE id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated","session_id":"a0000000-0000-4000-8000-000000000093"}', true);
SELECT public.accept_company_user_invite();
DO $$
DECLARE
    replay_result jsonb;
BEGIN
    replay_result := public.accept_company_user_invite();
    IF replay_result ->> 'already_accepted' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'invite acceptance replay was not idempotent';
    END IF;
    IF public.current_company_id() IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000001'::uuid THEN
        RAISE EXCEPTION 'accepted invite did not gain its own company context';
    END IF;
END;
$$;
RESET ROLE;

-- A legacy ADMIN can still administer users during migration, and an individual
-- ADMIN can remain after that legacy identity is inactivated.
SELECT public.saas_admin_update_company_user(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'deactivate', NULL
);

DO $$
DECLARE
    company_members jsonb;
BEGIN
    company_members := public.saas_admin_list_company_users(
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    );
    IF NOT company_members @> '[{"user_id":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}]'::jsonb
       OR NOT company_members @> '[{"user_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","status":"inactive"}]'::jsonb THEN
        RAISE EXCEPTION 'tenant ADMIN list omitted individual users or lifecycle status: %', company_members;
    END IF;
    IF company_members @> '[{"user_id":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}]'::jsonb THEN
        RAISE EXCEPTION 'tenant ADMIN list leaked user from company B';
    END IF;
END;
$$;

DO $$
BEGIN
    BEGIN
        PERFORM public.saas_admin_update_company_user(
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'deactivate', NULL
        );
        RAISE EXCEPTION 'last active ADMIN was deactivated';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        PERFORM public.saas_admin_update_company_user(
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'change_profile',
            'a0000000-0000-4000-8000-000000000014'
        );
        RAISE EXCEPTION 'last active ADMIN changed to a non-ADMIN profile';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        PERFORM public.saas_admin_update_company_user(
            'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'deactivate', NULL
        );
        RAISE EXCEPTION 'cross-tenant/legacy target was accepted';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;

-- Employee D receives a pending invite, accepts it, then the ADMIN deactivates
-- it. The same old JWT loses live RLS context immediately.
SELECT public.saas_admin_prepare_invite(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'employee-d@example.invalid',
    'a0000000-0000-4000-8000-000000000014'
);
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
    ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'employee-d@example.invalid', NULL);
INSERT INTO auth.sessions (id, user_id) VALUES
    ('a0000000-0000-4000-8000-000000000094', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
SELECT public.saas_admin_bind_invited_user(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'employee-d@example.invalid',
    'a0000000-0000-4000-8000-000000000014'
);
UPDATE auth.users
   SET email_confirmed_at = now()
 WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated","session_id":"a0000000-0000-4000-8000-000000000094"}', true);
SELECT public.accept_company_user_invite();
DO $$
BEGIN
    IF public.current_company_id() IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000001'::uuid THEN
        RAISE EXCEPTION 'employee invite did not activate';
    END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
    BEGIN
        PERFORM public.saas_admin_prepare_invite(
            'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            'another@example.invalid',
            'a0000000-0000-4000-8000-000000000014'
        );
        RAISE EXCEPTION 'active non-ADMIN actor was allowed to invite';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;

UPDATE public.security_profiles SET ativo = false
 WHERE id = 'a0000000-0000-4000-8000-000000000014';
DO $$
DECLARE
    inactive_profile_hook jsonb;
BEGIN
    inactive_profile_hook := public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'claims', '{}'::jsonb
    ));
    IF inactive_profile_hook #>> '{error,http_code}' IS DISTINCT FROM '403' THEN
        RAISE EXCEPTION 'inactive profile still receives Auth claims';
    END IF;
END;
$$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'inactive profile retains access with an old JWT';
    END IF;
END;
$$;
RESET ROLE;
UPDATE public.security_profiles SET ativo = true
 WHERE id = 'a0000000-0000-4000-8000-000000000014';

SELECT public.saas_admin_update_company_user(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'deactivate', NULL
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'deactivated user''s old JWT still resolves a tenant';
    END IF;
END;
$$;
RESET ROLE;
SELECT public.saas_admin_record_session_revocation(
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.security_audit_log
         WHERE event_type = 'SAAS_INVITE_ACCEPTED'
           AND actor_auth_user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
           AND target_auth_user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
           AND empresa_id = 'a0000000-0000-4000-8000-000000000001'
    ) THEN
        RAISE EXCEPTION 'invite acceptance audit is missing the trusted actor/tenant';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.security_audit_log
         WHERE event_type = 'SAAS_SESSIONS_REVOKED'
           AND actor_auth_user_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
           AND target_auth_user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
           AND empresa_id = 'a0000000-0000-4000-8000-000000000001'
    ) THEN
        RAISE EXCEPTION 'session revocation audit is missing the trusted actor/tenant';
    END IF;
END;
$$;

ROLLBACK;
