-- ═══════════════════════════════════════════════════════════════════════════════
-- 0014_multi_tenant.sql — Suporte Multi-Tenant (SaaS)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Adiciona tabela de empresas, coluna empresa_id em todas as tabelas,
-- e políticas RLS para isolamento entre clientes.

-- ─── 1. Tabela de Empresas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    cnpj TEXT,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'ativo', 'suspenso')),
    supabase_url TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_empresas_nome_not_blank CHECK (BTRIM(nome) <> '')
);

-- ─── 2. Adicionar empresa_id em todas as tabelas ───────────────────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE equipamentos ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE servicos_catalogo ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE verificacoes ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE comunicacoes ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE movimentacoes_estoque ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE gastos_fixos ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE gastos_variaveis ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE equipamento_imagens ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE security_profiles ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE security_audit_log ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE configuracoes_sistema ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;

-- ─── 3. Índices para performance ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_equipamentos_empresa ON equipamentos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_produtos_empresa ON produtos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_servicos_empresa ON servicos_catalogo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_verificacoes_empresa ON verificacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_empresa ON comunicacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_empresa ON movimentacoes_estoque(empresa_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fixos_empresa ON gastos_fixos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_gastos_variaveis_empresa ON gastos_variaveis(empresa_id);
CREATE INDEX IF NOT EXISTS idx_equipamento_imagens_empresa ON equipamento_imagens(empresa_id);
CREATE INDEX IF NOT EXISTS idx_security_profiles_empresa ON security_profiles(empresa_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_empresa ON security_audit_log(empresa_id);

-- ─── 4. Habilitar RLS em todas as tabelas ──────────────────────────────────────
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE servicos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE verificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comunicacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos_variaveis ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipamento_imagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_sistema ENABLE ROW LEVEL SECURITY;

-- ─── 5. Políticas RLS ─────────────────────────────────────────────────────────

-- Empresas: qualquer um pode ler (público), mas só insert via backend
CREATE POLICY "empresas_select_public" ON empresas
    FOR SELECT USING (true);

-- Tabelas de dados: só acessível se empresa estiver ativa e usuario pertencer
-- (Para simplificar, usamos o contexto da sessao via current_setting)
CREATE POLICY "clientes_isolamento" ON clientes
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "equipamentos_isolamento" ON equipamentos
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "produtos_isolamento" ON produtos
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "servicos_isolamento" ON servicos_catalogo
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "verificacoes_isolamento" ON verificacoes
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "comunicacoes_isolamento" ON comunicacoes
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "movimentacoes_isolamento" ON movimentacoes_estoque
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "gastos_fixos_isolamento" ON gastos_fixos
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "gastos_variaveis_isolamento" ON gastos_variaveis
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "equipamento_imagens_isolamento" ON equipamento_imagens
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "security_profiles_isolamento" ON security_profiles
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "security_audit_isolamento" ON security_audit_log
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );

CREATE POLICY "configuracoes_isolamento" ON configuracoes_sistema
    FOR ALL USING (
        empresa_id IS NULL OR
        empresa_id = current_setting('app.empresa_id', true)::INTEGER
    );
