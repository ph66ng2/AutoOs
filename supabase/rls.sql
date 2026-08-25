-- RLS do AutoOS SaaS para o Supabase staging.
--
-- Contrato de autenticação:
--   * somente JWTs de usuários autenticados chegam às tabelas de negócio;
--   * o servidor grava o company_id em auth.users.raw_app_meta_data;
--   * user_metadata nunca participa de autorização;
--   * service_role continua server-side e bypassa RLS pelo comportamento nativo;
--   * anon não recebe grants nem policies.

CREATE OR REPLACE FUNCTION public.current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN (auth.jwt() -> 'app_metadata' ->> 'company_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
        ELSE NULL
    END;
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
        'empresas', 'clientes', 'equipamentos', 'produtos',
        'movimentacoes_estoque', 'security_profiles', 'verificacoes',
        'comunicacoes', 'security_audit_log', 'equipamento_imagens',
        'servicos_catalogo', 'gastos_fixos', 'gastos_variaveis',
        'configuracoes_sistema', 'enrollment_codes', 'os_status_publico',
        'photo_upload_sessions', 'photo_upload_session_items'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', table_name);
        EXECUTE format('DROP POLICY IF EXISTS anon_filter_empresa_id ON public.%I', table_name);
    END LOOP;
END;
$$;

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
        'clientes', 'equipamentos', 'produtos', 'movimentacoes_estoque',
        'security_profiles', 'verificacoes', 'comunicacoes',
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

-- Auditoria é legível pelo tenant, mas eventos são gravados por comandos
-- server-side; o cliente não pode fabricar ou apagar trilha de segurança.
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
    public.photo_upload_sessions, public.photo_upload_session_items
    FROM PUBLIC, anon, authenticated;
