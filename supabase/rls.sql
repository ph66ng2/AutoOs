-- RLS do AutoOS SaaS para o Supabase staging.
--
-- Contrato de autenticação:
--   * somente JWTs de usuários autenticados chegam às tabelas de negócio;
--   * auth.uid() é resolvido no vínculo server-side ativo; claims não autorizam;
--   * user_metadata nunca participa de autorização;
--   * service_role continua server-side e bypassa RLS pelo comportamento nativo;
--   * anon não recebe grants nem policies.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- O auth.uid() é validado contra o vínculo server-side atual a cada consulta.
-- Assim, suspender a empresa, o perfil ou a identidade corta o acesso mesmo
-- antes do access token atual expirar. Claims ausentes/antigas não quebram a
-- compatibilidade do ADMIN legado, e claims adulteradas não escolhem tenant.
-- SECURITY DEFINER fica restrito a este lookup interno, com search_path vazio.
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
REVOKE ALL ON FUNCTION private.current_saas_session_identity() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_saas_session_identity() TO authenticated;

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
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.authorized_company_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT private.authorized_company_id();
$$;

REVOKE ALL ON FUNCTION public.current_company_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_company_id() TO authenticated;

-- Todas as tabelas públicas ficam fechadas para os papéis de cliente antes de
-- receberem somente os grants/policies abaixo. A configuração Data API deve
-- continuar com exposição automática desativada.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'empresas', 'clientes', 'cliente_contatos', 'equipamentos', 'produtos',
        'movimentacoes_estoque', 'security_profiles', 'verificacoes',
        'comunicacoes', 'security_audit_log', 'equipamento_imagens',
        'servicos_catalogo', 'gastos_fixos', 'gastos_variaveis',
        'configuracoes_sistema', 'enrollment_codes', 'os_status_publico',
        'photo_upload_sessions', 'photo_upload_session_items',
        'company_admin_identities', 'company_user_identities'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
        EXECUTE format('DROP POLICY IF EXISTS anon_filter_empresa_id ON public.%I', table_name);
    END LOOP;
END;
$$;

-- O Auth hook usa somente SELECT e somente como supabase_auth_admin. A tabela
-- de vínculo não é exposta a anon/authenticated nem pela Data API.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT (auth_user_id, empresa_id, profile_id, ativo)
    ON TABLE public.company_admin_identities TO supabase_auth_admin;
GRANT SELECT (auth_user_id, empresa_id, profile_id, ativo)
    ON TABLE public.company_user_identities TO supabase_auth_admin;
GRANT SELECT (id, ativo) ON TABLE public.empresas TO supabase_auth_admin;
GRANT SELECT (id, empresa_id, role, ativo)
    ON TABLE public.security_profiles TO supabase_auth_admin;

DROP POLICY IF EXISTS auth_hook_select ON public.company_admin_identities;
CREATE POLICY auth_hook_select ON public.company_admin_identities
    FOR SELECT TO supabase_auth_admin
    USING (true);
DROP POLICY IF EXISTS auth_hook_select ON public.company_user_identities;
CREATE POLICY auth_hook_select ON public.company_user_identities
    FOR SELECT TO supabase_auth_admin
    USING (true);
DROP POLICY IF EXISTS auth_hook_select ON public.empresas;
CREATE POLICY auth_hook_select ON public.empresas
    FOR SELECT TO supabase_auth_admin
    USING (true);
DROP POLICY IF EXISTS auth_hook_select ON public.security_profiles;
CREATE POLICY auth_hook_select ON public.security_profiles
    FOR SELECT TO supabase_auth_admin
    USING (true);

-- A empresa é provisionada pelo backend; usuários autenticados podem apenas
-- consultar a própria empresa.
DROP POLICY IF EXISTS company_select ON public.empresas;
DROP POLICY IF EXISTS anon_filter_empresa_id ON public.empresas;
CREATE POLICY company_select ON public.empresas
    FOR SELECT TO authenticated
    USING (id = (select public.current_company_id()));
GRANT SELECT ON TABLE public.empresas TO authenticated;

-- Tabelas de negócio acessíveis pelo plano Online e pelo backend do Offline.
-- Cada operação explicita o papel e o predicado de tenant.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'clientes', 'cliente_contatos', 'equipamentos', 'produtos', 'movimentacoes_estoque',
        'verificacoes', 'comunicacoes',
        'equipamento_imagens', 'servicos_catalogo', 'gastos_fixos',
        'gastos_variaveis', 'configuracoes_sistema'
    ] LOOP
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', table_name);

        EXECUTE format('DROP POLICY IF EXISTS company_select ON public.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS company_insert ON public.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS company_update ON public.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS company_delete ON public.%I', table_name);
        EXECUTE format('DROP POLICY IF EXISTS anon_filter_empresa_id ON public.%I', table_name);

        EXECUTE format(
            'CREATE POLICY company_select ON public.%I FOR SELECT TO authenticated USING (empresa_id = (select public.current_company_id()))',
            table_name
        );
        EXECUTE format(
            'CREATE POLICY company_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (empresa_id = (select public.current_company_id()))',
            table_name
        );
        EXECUTE format(
            'CREATE POLICY company_update ON public.%I FOR UPDATE TO authenticated USING (empresa_id = (select public.current_company_id())) WITH CHECK (empresa_id = (select public.current_company_id()))',
            table_name
        );
        EXECUTE format(
            'CREATE POLICY company_delete ON public.%I FOR DELETE TO authenticated USING (empresa_id = (select public.current_company_id()))',
            table_name
        );
    END LOOP;
END;
$$;

-- A comunicação também deve apontar para equipamento da mesma empresa.
-- As políticas acima já restringem a empresa da linha; este predicado bloqueia
-- UUIDs de equipamento cruzados tanto em INSERT quanto em UPDATE.
DROP POLICY IF EXISTS company_insert ON public.comunicacoes;
CREATE POLICY company_insert ON public.comunicacoes
    FOR INSERT TO authenticated
    WITH CHECK (
        empresa_id = (select public.current_company_id())
        AND EXISTS (
            SELECT 1
              FROM public.equipamentos AS equipment
             WHERE equipment.id = comunicacoes.equipamento_id
               AND equipment.empresa_id = comunicacoes.empresa_id
        )
    );

DROP POLICY IF EXISTS company_update ON public.comunicacoes;
CREATE POLICY company_update ON public.comunicacoes
    FOR UPDATE TO authenticated
    USING (empresa_id = (select public.current_company_id()))
    WITH CHECK (
        empresa_id = (select public.current_company_id())
        AND EXISTS (
            SELECT 1
              FROM public.equipamentos AS equipment
             WHERE equipment.id = comunicacoes.equipamento_id
               AND equipment.empresa_id = comunicacoes.empresa_id
        )
    );

-- Perfis definem a autorização SaaS: o cliente só pode ler os perfis do tenant.
-- Escritas futuras devem passar por uma RPC server-side autorizada.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.security_profiles
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.security_profiles TO authenticated;
DROP POLICY IF EXISTS company_select ON public.security_profiles;
DROP POLICY IF EXISTS company_insert ON public.security_profiles;
DROP POLICY IF EXISTS company_update ON public.security_profiles;
DROP POLICY IF EXISTS company_delete ON public.security_profiles;
CREATE POLICY company_select ON public.security_profiles
    FOR SELECT TO authenticated
    USING (empresa_id = (select public.current_company_id()));

-- Auditoria é legível pelo tenant, mas eventos são gravados por comandos
-- server-side; o cliente não pode fabricar ou apagar trilha de segurança.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.security_audit_log
    FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.security_audit_log TO authenticated;
DROP POLICY IF EXISTS company_select ON public.security_audit_log;
DROP POLICY IF EXISTS company_insert ON public.security_audit_log;
DROP POLICY IF EXISTS company_update ON public.security_audit_log;
DROP POLICY IF EXISTS company_delete ON public.security_audit_log;
DROP POLICY IF EXISTS anon_filter_empresa_id ON public.security_audit_log;
CREATE POLICY company_select ON public.security_audit_log
    FOR SELECT TO authenticated
    USING (empresa_id = (select public.current_company_id()));

-- Enrollment, status público, sessões de upload e itens de sessão ficam atrás
-- de Edge Functions/backend. Não são expostos à Data API por chave de cliente.
REVOKE ALL ON TABLE public.enrollment_codes, public.os_status_publico,
    public.photo_upload_sessions, public.photo_upload_session_items,
    public.company_admin_identities, public.company_user_identities
    FROM PUBLIC, anon, authenticated;
