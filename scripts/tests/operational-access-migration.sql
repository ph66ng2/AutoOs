-- Apenas PostgreSQL local de testes. A tabela temporária oculta qualquer tabela persistente.
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
    (1, 'Ivan', 'TECNICO', '["STOCK_CONTROL","PREPARE_QUOTES"]', TRUE),
    (2, 'Maria', 'FINANCEIRO', '["FINANCIAL_ACTIONS"]', TRUE),
    (3, 'Ana', 'ATENDENTE', '[]', TRUE),
    (4, ' TÉCNICO ', 'CUSTOM', '["VIEW_EXPENSES"]', FALSE),
    (5, 'TECNICO', 'CUSTOM', '[]', TRUE),
    (6, 'FINANCEIRO', 'CUSTOM', '[]', TRUE),
    (7, 'RECEPÇÃO', 'CUSTOM', '[]', TRUE),
    (8, 'recepcao', 'CUSTOM', '[]', TRUE),
    (9, 'Isayas', 'CUSTOM', '["STOCK_CONTROL"]', TRUE),
    (10, 'Admin', 'ADMIN', '["FINANCIAL_ACTIONS"]', TRUE),
    (11, 'Já liberado', 'TECNICO', '["MANAGE_STATUS_LINKS"]', TRUE),
    (12, 'Legado inválido', 'TECNICO', 'legado', TRUE),
    (13, 'Objeto legado', 'TECNICO', '{}', TRUE);
CREATE TEMP TABLE antes AS SELECT * FROM security_profiles;
\ir ../../src-tauri/migrations/0050_acessos_portal_operacional.sql
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM security_profiles WHERE id BETWEEN 1 AND 8 AND NOT permissions::jsonb ? 'MANAGE_STATUS_LINKS') THEN
        RAISE EXCEPTION 'Equipe operacional não recebeu acessos do portal';
    END IF;
    IF EXISTS (SELECT * FROM security_profiles WHERE id >= 9 EXCEPT SELECT * FROM antes WHERE id >= 9) THEN
        RAISE EXCEPTION 'Personalizado, ADMIN, já liberado ou legado alterado';
    END IF;
    IF EXISTS (SELECT 1 FROM security_profiles p JOIN antes a USING(id)
        WHERE p.id <= 11 AND (p.permissions::jsonb ? 'FINANCIAL_ACTIONS') IS DISTINCT FROM (a.permissions::jsonb ? 'FINANCIAL_ACTIONS')) THEN
        RAISE EXCEPTION 'Migration não pode conceder nem retirar financeiro';
    END IF;
    IF EXISTS (SELECT 1 FROM security_profiles p JOIN antes a USING(id)
        WHERE p.id <= 11 AND NOT p.permissions::jsonb @> a.permissions::jsonb) THEN
        RAISE EXCEPTION 'Permissões anteriores perdidas';
    END IF;
END $$;
CREATE TEMP TABLE primeira_execucao AS SELECT * FROM security_profiles;
\ir ../../src-tauri/migrations/0050_acessos_portal_operacional.sql
DO $$ BEGIN
    IF EXISTS (SELECT * FROM security_profiles EXCEPT SELECT * FROM primeira_execucao) THEN
        RAISE EXCEPTION 'Migration 0050 não idempotente';
    END IF;
END $$;
ROLLBACK;
