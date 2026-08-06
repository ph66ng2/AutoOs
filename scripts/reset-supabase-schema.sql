-- ═══════════════════════════════════════════════════════════════════════════════
-- reset-supabase-schema.sql — RESET COMPLETO para schema INTEGER (compatível Rust)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Use isso se você aplicou o schema UUID do supabase/schema.sql e precisa voltar
-- ao schema INTEGER original das migrations (0001-0013) que é 100% compatível
-- com o backend Rust atual.
--
-- ⚠️ ATENÇÃO: Isso APAGA TODOS OS DADOS. Use apenas em desenvolvimento/testes.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Dropar tabelas na ordem correta (FKs primeiro)
DROP TABLE IF EXISTS security_audit_log CASCADE;
DROP TABLE IF EXISTS enrollment_codes CASCADE;
DROP TABLE IF EXISTS os_status_publico CASCADE;
DROP TABLE IF EXISTS equipamento_imagens CASCADE;
DROP TABLE IF EXISTS verificacoes CASCADE;
DROP TABLE IF EXISTS comunicacoes CASCADE;
DROP TABLE IF EXISTS movimentacoes_estoque CASCADE;
DROP TABLE IF EXISTS gastos_variaveis CASCADE;
DROP TABLE IF EXISTS gastos_fixos CASCADE;
DROP TABLE IF EXISTS produtos CASCADE;
DROP TABLE IF EXISTS servicos_catalogo CASCADE;
DROP TABLE IF EXISTS equipamentos CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS configuracoes_sistema CASCADE;
DROP TABLE IF EXISTS security_profiles CASCADE;
DROP TABLE IF EXISTS empresas CASCADE;

-- 2. Resetar controle de migrations do sqlx
-- (sem isso, o app Rust pula as migrations achando que já foram aplicadas)
DROP TABLE IF EXISTS _sqlx_migrations CASCADE;

-- 3. Criar tabela de migrations do sqlx vazia
-- (o app vai preencher e rodar as migrations do src-tauri/migrations/)
CREATE TABLE IF NOT EXISTS _sqlx_migrations (
    version BIGINT PRIMARY KEY,
    description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL DEFAULT true,
    checksum BYTEA NOT NULL,
    execution_time BIGINT NOT NULL
);

-- 4. Confirmação
SELECT 'Schema resetado. Agora rode o app (npm run tauri dev) para aplicar migrations INTEGER automaticamente.' AS status;
