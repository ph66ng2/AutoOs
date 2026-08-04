-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase/rls.sql — Row Level Security (RLS) para todas as tabelas AutoOS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Políticas:
--   • service_role: bypass automático de RLS (comportamento built-in do Supabase)
--   • anon key: filtra por empresa_id usando current_setting('app.empresa_id')
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Habilitar RLS em todas as tabelas ─────────────────────────────────────────
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE verificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipamento_imagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_variaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_sistema ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_status_publico ENABLE ROW LEVEL SECURITY;

-- ─── Política padrão para anon (filtra por empresa_id) ─────────────────────────
-- A política é aplicada a todas as operações (SELECT, INSERT, UPDATE, DELETE).
-- O app define app.empresa_id via SET LOCAL antes de cada transação.

CREATE POLICY anon_filter_empresa_id ON empresas
    FOR ALL TO anon
    USING (id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON clientes
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON equipamentos
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON produtos
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON movimentacoes_estoque
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON security_profiles
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON verificacoes
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON comunicacoes
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON security_audit_log
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON equipamento_imagens
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON servicos_catalogo
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON gastos_fixos
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON gastos_variaveis
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON configuracoes_sistema
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON enrollment_codes
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);

CREATE POLICY anon_filter_empresa_id ON os_status_publico
    FOR ALL TO anon
    USING (empresa_id = current_setting('app.empresa_id', true)::uuid)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);
