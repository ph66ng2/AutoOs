-- Executar apenas em PostgreSQL local de testes: tabela temporária oculta a tabela real.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE security_profiles (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    role TEXT NOT NULL,
    permissions TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT '2026-01-01Z'
);
INSERT INTO security_profiles (id, nome, role, permissions, ativo) VALUES
    (1, 'Ivan', 'TECNICO', '["STOCK_CONTROL"]', TRUE),
    (2, 'Técnico', 'CUSTOM', '[]', FALSE),
    (3, 'Financeiro', 'CUSTOM', '["FINANCIAL_ACTIONS"]', TRUE),
    (4, 'Maria', 'FINANCEIRO', '["FINANCIAL_ACTIONS"]', TRUE),
    (5, 'Recepção', 'ATENDENTE', '[]', TRUE),
    (6, 'Admin', 'ADMIN', '["PREPARE_QUOTES"]', TRUE),
    (7, 'Outro', 'CUSTOM', '["STOCK_CONTROL"]', TRUE),
    (8, 'Já liberado', 'TECNICO', '["PREPARE_QUOTES"]', TRUE);
\ir ../../src-tauri/migrations/0048_prepare_quotes_tecnico_financeiro.sql
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM security_profiles WHERE id IN (1,2,3,4,8) AND NOT permissions::jsonb ? 'PREPARE_QUOTES') THEN
        RAISE EXCEPTION 'Técnico/Financeiro não recebeu PREPARE_QUOTES';
    END IF;
    IF EXISTS (SELECT 1 FROM security_profiles WHERE id IN (5,7) AND permissions::jsonb ? 'PREPARE_QUOTES') THEN
        RAISE EXCEPTION 'Concessão fora do escopo';
    END IF;
    IF (SELECT permissions::jsonb FROM security_profiles WHERE id = 1) <> '["STOCK_CONTROL","PREPARE_QUOTES"]'::jsonb THEN
        RAISE EXCEPTION 'Permissões anteriores não preservadas';
    END IF;
END $$;
CREATE TEMP TABLE primeira_execucao AS SELECT * FROM security_profiles;
\ir ../../src-tauri/migrations/0048_prepare_quotes_tecnico_financeiro.sql
DO $$ BEGIN
    IF EXISTS (SELECT * FROM security_profiles EXCEPT SELECT * FROM primeira_execucao) THEN
        RAISE EXCEPTION 'Migration 0048 não idempotente';
    END IF;
END $$;
ROLLBACK;
