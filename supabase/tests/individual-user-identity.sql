-- Requer os dois tenants/usuários sintéticos provisionados por
-- validate-staging-auth.mjs. Todas as alterações locais terminam em ROLLBACK.
BEGIN;

DO $$
BEGIN
    IF (SELECT count(*) FROM public.company_admin_identities AS identity
        JOIN public.empresas AS company ON company.id = identity.empresa_id
        WHERE company.nome LIKE 'AO-AUTH-TEST-%') <> 2 THEN
        RAISE EXCEPTION 'expected exactly two AO-AUTH-TEST identities';
    END IF;
    IF has_table_privilege('anon', 'public.company_user_identities', 'SELECT')
       OR has_table_privilege('authenticated', 'public.company_user_identities', 'SELECT')
       OR has_table_privilege('authenticated', 'public.company_user_identities', 'INSERT') THEN
        RAISE EXCEPTION 'client role can access private user identity bindings';
    END IF;
    IF NOT has_function_privilege(
        'supabase_auth_admin', 'public.autoos_custom_access_token_hook(jsonb)', 'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'supabase_auth_admin cannot execute the custom access token hook';
    END IF;
END;
$$;

INSERT INTO public.security_profiles (
    id, empresa_id, nome, role, permissions, ativo, is_default
) VALUES (
    'a0000000-0000-4000-8000-000000000012',
    'a0000000-0000-4000-8000-000000000001',
    'AO-AUTH-TEST-EMPLOYEE', 'TECNICO', '[]', true, false
);

DO $$
BEGIN
    BEGIN
        INSERT INTO public.company_user_identities (auth_user_id, empresa_id, profile_id)
        VALUES (
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'a0000000-0000-4000-8000-000000000001',
            'b0000000-0000-4000-8000-000000000011'
        );
        RAISE EXCEPTION 'cross-tenant identity/profile association was accepted';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;
END;
$$;

INSERT INTO public.company_user_identities (
    auth_user_id, empresa_id, profile_id
)
SELECT auth_user_id,
       'a0000000-0000-4000-8000-000000000001',
       'a0000000-0000-4000-8000-000000000012'
  FROM public.company_admin_identities
 WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';

INSERT INTO public.clientes (id, empresa_id, nome) VALUES
    ('a0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000001', 'Individual Cliente A'),
    ('b0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000001', 'Individual Cliente B');

SELECT set_config(
    'autoos.test.individual_user_a',
    jsonb_build_object(
        'sub', identity.auth_user_id,
        'app_metadata', jsonb_build_object(
            'company_id', 'b0000000-0000-4000-8000-000000000001',
            'profile_id', 'b0000000-0000-4000-8000-000000000011',
            'profile_role', 'ADMIN'
        ),
        'user_metadata', jsonb_build_object(
            'company_id', 'b0000000-0000-4000-8000-000000000001',
            'profile_id', 'b0000000-0000-4000-8000-000000000011',
            'profile_role', 'ADMIN'
        )
    )::text,
    true
)
FROM public.company_admin_identities AS identity
WHERE identity.empresa_id = 'a0000000-0000-4000-8000-000000000001';

DO $$
DECLARE
    user_a uuid;
    hook_result jsonb;
BEGIN
    SELECT auth_user_id INTO STRICT user_a
      FROM public.company_user_identities
     WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';

    hook_result := public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', user_a,
        'claims', jsonb_build_object(
            'app_metadata', jsonb_build_object(
                'company_id', 'b0000000-0000-4000-8000-000000000001',
                'profile_id', 'b0000000-0000-4000-8000-000000000011',
                'profile_role', 'ADMIN'
            ),
            'user_metadata', jsonb_build_object(
                'company_id', 'b0000000-0000-4000-8000-000000000001',
                'profile_id', 'b0000000-0000-4000-8000-000000000011',
                'profile_role', 'ADMIN'
            )
        )
    ));

    IF hook_result #>> '{claims,app_metadata,company_id}'
       IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000001'
       OR hook_result #>> '{claims,app_metadata,profile_id}'
       IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000012'
       OR hook_result #>> '{claims,app_metadata,profile_role}'
       IS DISTINCT FROM 'TECNICO' THEN
        RAISE EXCEPTION 'individual hook did not replace untrusted claims: %', hook_result;
    END IF;
END;
$$;

SET LOCAL ROLE supabase_auth_admin;
DO $$
DECLARE
    user_a uuid;
    hook_result jsonb;
BEGIN
    SELECT auth_user_id INTO STRICT user_a
      FROM public.company_user_identities
     WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';
    hook_result := public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', user_a,
        'claims', '{}'::jsonb
    ));
    IF hook_result #>> '{claims,app_metadata,profile_id}'
       IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000012' THEN
        RAISE EXCEPTION 'Auth Hook could not read the binding using its least-privilege role';
    END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
    BEGIN
        INSERT INTO public.company_user_identities (auth_user_id, empresa_id, profile_id)
        VALUES (
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'a0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000011'
        );
        RAISE EXCEPTION 'one Auth user received a second identity binding';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.individual_user_a'), true);

DO $$
DECLARE
    visible_rows integer;
BEGIN
    IF public.current_company_id() IS DISTINCT FROM
       'a0000000-0000-4000-8000-000000000001'::uuid THEN
        RAISE EXCEPTION 'individual login did not resolve its server-side tenant';
    END IF;

    SELECT count(*) INTO visible_rows FROM public.clientes;
    IF visible_rows <> 1 THEN
        RAISE EXCEPTION 'individual user saw % rows instead of only tenant A', visible_rows;
    END IF;

    BEGIN
        INSERT INTO public.clientes (id, empresa_id, nome)
        VALUES (
            'b0000000-0000-4000-8000-000000000032',
            'b0000000-0000-4000-8000-000000000001',
            'Forbidden cross-tenant insert'
        );
        RAISE EXCEPTION 'cross-tenant write was accepted';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
END;
$$;

RESET ROLE;
UPDATE public.security_profiles
   SET ativo = false, atualizado_em = CURRENT_TIMESTAMP
 WHERE id = 'a0000000-0000-4000-8000-000000000012';

DO $$
DECLARE
    user_a uuid;
    hook_result jsonb;
BEGIN
    SELECT auth_user_id INTO STRICT user_a
      FROM public.company_user_identities
     WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';
    hook_result := public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', user_a,
        'claims', '{}'::jsonb
    ));
    IF hook_result #>> '{error,http_code}' IS DISTINCT FROM '403' THEN
        RAISE EXCEPTION 'inactive individual profile still receives Auth claims';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'stale JWT retained access after the linked profile was deactivated';
    END IF;
END;
$$;

RESET ROLE;
UPDATE public.security_profiles
   SET ativo = true, atualizado_em = CURRENT_TIMESTAMP
 WHERE id = 'a0000000-0000-4000-8000-000000000012';
UPDATE public.company_user_identities
   SET ativo = false, suspended_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
 WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'stale JWT retained access after the identity was suspended';
    END IF;
END;
$$;

SELECT set_config(
    'request.jwt.claims',
    '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}',
    true
);
DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'user without a server-side binding received a tenant';
    END IF;
END;
$$;

ROLLBACK;
