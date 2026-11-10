-- Executar apenas em PostgreSQL local de testes, com tabela temporária.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE security_profiles (
    id INTEGER PRIMARY KEY,
    permissions TEXT NOT NULL,
    avatar_icone TEXT,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT '2026-01-01Z'
);
INSERT INTO security_profiles (id, permissions, avatar_icone) VALUES
    (1, '["CONFIG_SMTP","VIEW_EXPENSES"]', 'headphones'),
    (2, '["CONFIG_WHATSAPP"]', 'wrench'),
    (3, '["CONFIG_SMTP","CONFIG_WHATSAPP","COMMUNICATION_SETTINGS","MANAGE_STATUS_LINKS"]', 'printer'),
    (4, '["MANAGE_STATUS_LINKS"]', 'shape-hex'),
    (5, '[]', NULL),
    (6, '["FINANCIAL_ACTIONS","PREPARE_QUOTES"]', 'coffee'),
    (7, '["COMMUNICATION_SETTINGS"]', 'shape-peak');
\ir ../../src-tauri/migrations/0049_comunicacao_externa_avatares_formas.sql
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM security_profiles WHERE id IN (1,2,3,7) AND NOT permissions::jsonb ? 'COMMUNICATION_SETTINGS') THEN
        RAISE EXCEPTION 'Configuração antiga não mapeada';
    END IF;
    IF EXISTS (SELECT 1 FROM security_profiles WHERE permissions::jsonb ?| ARRAY['CONFIG_SMTP','CONFIG_WHATSAPP']) THEN
        RAISE EXCEPTION 'Chaves antigas preservadas indevidamente';
    END IF;
    IF (SELECT permissions::jsonb FROM security_profiles WHERE id = 3) <> '["COMMUNICATION_SETTINGS","MANAGE_STATUS_LINKS"]'::jsonb THEN
        RAISE EXCEPTION 'União de permissões não remove duplicatas ou perdeu acesso';
    END IF;
    IF (SELECT permissions::jsonb FROM security_profiles WHERE id = 4) <> '["MANAGE_STATUS_LINKS"]'::jsonb THEN
        RAISE EXCEPTION 'Acessos do portal não pode ganhar comunicação externa';
    END IF;
    IF NOT (SELECT permissions::jsonb ? 'VIEW_EXPENSES' FROM security_profiles WHERE id = 1) THEN
        RAISE EXCEPTION 'Permissão não relacionada perdida';
    END IF;
    IF (SELECT avatar_icone FROM security_profiles WHERE id = 1) <> 'shape-square'
       OR (SELECT avatar_icone FROM security_profiles WHERE id = 2) <> 'shape-peak'
       OR (SELECT avatar_icone FROM security_profiles WHERE id = 3) <> 'shape-pill'
       OR (SELECT avatar_icone FROM security_profiles WHERE id = 4) <> 'shape-hex'
       OR (SELECT avatar_icone FROM security_profiles WHERE id = 5) IS NOT NULL THEN
        RAISE EXCEPTION 'Conversão de avatar ou preservação das formas incorreta';
    END IF;
END $$;
CREATE TEMP TABLE primeira_execucao AS SELECT * FROM security_profiles;
\ir ../../src-tauri/migrations/0049_comunicacao_externa_avatares_formas.sql
DO $$ BEGIN
    IF EXISTS (SELECT * FROM security_profiles EXCEPT SELECT * FROM primeira_execucao) THEN
        RAISE EXCEPTION 'Migration 0049 não idempotente';
    END IF;
END $$;
ROLLBACK;
