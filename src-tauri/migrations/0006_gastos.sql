-- ═══════════════════════════════════════════════════════════════
-- Migration 0006: Gastos Fixos e Variáveis
-- ═══════════════════════════════════════════════════════════════
-- Cria as tabelas de gastos fixos (despesas recorrentes) e
-- gastos variáveis (despesas avulsas/extraordinárias) com
-- relacionamento opcional entre si.
-- ═══════════════════════════════════════════════════════════════

-- ─── Gastos Fixos ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gastos_fixos (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    vencimento_dia INTEGER,
    categoria TEXT NOT NULL,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_gastos_fixos_valor_nao_negativo
        CHECK (valor >= 0),
    CONSTRAINT chk_gastos_fixos_vencimento_dia_valido
        CHECK (vencimento_dia IS NULL OR (vencimento_dia >= 1 AND vencimento_dia <= 31))
);

-- ─── Gastos Variáveis ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS gastos_variaveis (
    id SERIAL PRIMARY KEY,
    descricao TEXT NOT NULL,
    valor NUMERIC(15,2) NOT NULL,
    data DATE NOT NULL,
    categoria TEXT NOT NULL,
    nota TEXT,
    referencia_id INTEGER,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gastos_variaveis_referencia
        FOREIGN KEY (referencia_id) REFERENCES gastos_fixos(id) ON DELETE SET NULL,
    CONSTRAINT chk_gastos_variaveis_valor_positivo
        CHECK (valor > 0),
    CONSTRAINT chk_gastos_variaveis_data_nao_futura
        CHECK (data <= CURRENT_DATE)
);

-- ─── Índices ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gastos_variaveis_data
    ON gastos_variaveis (data);

CREATE INDEX IF NOT EXISTS idx_gastos_variaveis_categoria_data
    ON gastos_variaveis (categoria, data);

-- ─── Seed: Categorias de Gastos Fixos (referência) ─────────
-- Categorias padrão como linhas de gastos_fixos inativos com
-- valor zero, servindo como referência para o campo categoria
-- em ambas as tabelas.

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Aluguel', 0, NULL, 'Aluguel', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Aluguel');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Energia', 0, NULL, 'Energia', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Energia');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Internet', 0, NULL, 'Internet', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Internet');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Fornecedores', 0, NULL, 'Fornecedores', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Fornecedores');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Folha', 0, NULL, 'Folha', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Folha');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Outros', 0, NULL, 'Outros', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Outros');
