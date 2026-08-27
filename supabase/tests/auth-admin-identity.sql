-- Requer os dois tenants/usuários sintéticos criados pelo validador. Todos os
-- registros adicionais e mudanças de status abaixo terminam em ROLLBACK.
BEGIN;

DO $$
BEGIN
    IF (SELECT count(*) FROM public.company_admin_identities AS identity
        JOIN public.empresas AS company ON company.id = identity.empresa_id
        WHERE company.nome LIKE 'AO-AUTH-TEST-%') <> 2 THEN
        RAISE EXCEPTION 'expected exactly two AO-AUTH-TEST identities';
    END IF;
END;
$$;

INSERT INTO public.clientes (id, empresa_id, nome) VALUES
    ('a0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000001', 'Auth Cliente A'),
    ('b0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-000000000001', 'Auth Cliente B');

DO $$
DECLARE
    user_a uuid;
    hook_result jsonb;
BEGIN
    SELECT auth_user_id INTO STRICT user_a
    FROM public.company_admin_identities
    WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';

    hook_result := public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', user_a,
        'claims', jsonb_build_object(
            'sub', user_a,
            'app_metadata', jsonb_build_object(
                'company_id', 'b0000000-0000-4000-8000-000000000001',
                'profile_id', 'b0000000-0000-4000-8000-000000000011'
            ),
            'user_metadata', jsonb_build_object(
                'company_id', 'b0000000-0000-4000-8000-000000000001'
            )
        )
    ));

    IF hook_result #>> '{claims,app_metadata,company_id}'
       IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000001'
       OR hook_result #>> '{claims,app_metadata,profile_id}'
       IS DISTINCT FROM 'a0000000-0000-4000-8000-000000000011' THEN
        RAISE EXCEPTION 'hook accepted spoofed tenant/profile claims: %', hook_result;
    END IF;

    IF (public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        'claims', '{}'::jsonb
    )) #>> '{error,http_code}') IS DISTINCT FROM '403' THEN
        RAISE EXCEPTION 'unbound Auth user was not denied';
    END IF;
END;
$$;

-- Empresa e perfil inativos também impedem nova emissão de token.
UPDATE public.empresas SET ativo = false
WHERE id = 'a0000000-0000-4000-8000-000000000001';
DO $$
DECLARE
    user_a uuid;
BEGIN
    SELECT auth_user_id INTO STRICT user_a
    FROM public.company_admin_identities
    WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';
    IF (public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', user_a, 'claims', '{}'::jsonb
    )) #>> '{error,http_code}') IS DISTINCT FROM '403' THEN
        RAISE EXCEPTION 'inactive company still receives claims';
    END IF;
END;
$$;
UPDATE public.empresas SET ativo = true
WHERE id = 'a0000000-0000-4000-8000-000000000001';

UPDATE public.security_profiles SET ativo = false
WHERE id = 'a0000000-0000-4000-8000-000000000011';
DO $$
DECLARE
    user_a uuid;
BEGIN
    SELECT auth_user_id INTO STRICT user_a
    FROM public.company_admin_identities
    WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';
    IF (public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', user_a, 'claims', '{}'::jsonb
    )) #>> '{error,http_code}') IS DISTINCT FROM '403' THEN
        RAISE EXCEPTION 'inactive profile still receives claims';
    END IF;
END;
$$;
UPDATE public.security_profiles SET ativo = true
WHERE id = 'a0000000-0000-4000-8000-000000000011';

SELECT set_config(
    'autoos.test.jwt_a',
    jsonb_build_object(
        'sub', identity.auth_user_id,
        'app_metadata', jsonb_build_object(
            'company_id', identity.empresa_id,
            'profile_id', identity.profile_id
        )
    )::text,
    true
)
FROM public.company_admin_identities AS identity
WHERE identity.empresa_id = 'a0000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.jwt_a'), true);

DO $$
DECLARE
    visible_rows integer;
BEGIN
    SELECT count(*) INTO visible_rows FROM public.clientes;
    IF visible_rows <> 1 THEN
        RAISE EXCEPTION 'tenant A sees % rows, expected exactly one', visible_rows;
    END IF;
END;
$$;

SELECT set_config('request.jwt.claims', '{}', true);
DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'JWT without authoritative claims authorized a tenant';
    END IF;
END;
$$;

-- Claim de empresa correta com profile_id de outro tenant não autoriza nada.
SELECT set_config(
    'request.jwt.claims',
    jsonb_set(
        current_setting('autoos.test.jwt_a')::jsonb,
        '{app_metadata,profile_id}',
        '"b0000000-0000-4000-8000-000000000011"'::jsonb
    )::text,
    true
);

DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'mismatched profile claim authorized a tenant';
    END IF;
END;
$$;

RESET ROLE;
UPDATE public.company_admin_identities
SET ativo = false, suspended_at = now(), updated_at = now()
WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';

DO $$
DECLARE
    user_a uuid;
BEGIN
    SELECT auth_user_id INTO STRICT user_a
    FROM public.company_admin_identities
    WHERE empresa_id = 'a0000000-0000-4000-8000-000000000001';
    IF (public.autoos_custom_access_token_hook(jsonb_build_object(
        'user_id', user_a,
        'claims', '{}'::jsonb
    )) #>> '{error,http_code}') IS DISTINCT FROM '403' THEN
        RAISE EXCEPTION 'suspended identity still receives claims';
    END IF;
END;
$$;

SELECT set_config(
    'autoos.test.jwt_a',
    jsonb_build_object(
        'sub', identity.auth_user_id,
        'app_metadata', jsonb_build_object(
            'company_id', identity.empresa_id,
            'profile_id', identity.profile_id
        )
    )::text,
    true
)
FROM public.company_admin_identities AS identity
WHERE identity.empresa_id = 'a0000000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', current_setting('autoos.test.jwt_a'), true);

DO $$
BEGIN
    IF public.current_company_id() IS NOT NULL THEN
        RAISE EXCEPTION 'suspended identity retained access with a stale JWT';
    END IF;
END;
$$;

ROLLBACK;
