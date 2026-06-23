-- Migration 0010: Melhorias AutoOS - configurações de sistema e auditoria de verificações
-- Adiciona tabela singleton para configurações globais e rastreamento de ajustes em verificações.

-- Tabela singleton de configurações do sistema (id=1)
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    inactivity_lock_enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insere linha padrão caso ainda não exista
INSERT INTO configuracoes_sistema (id, inactivity_lock_enabled)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Colunas de auditoria para ajustes em verificações
ALTER TABLE verificacoes
    ADD COLUMN IF NOT EXISTS adjusted_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS adjusted_by_profile_id INTEGER;

-- Constraint de FK para adjusted_by_profile_id (não possui IF NOT EXISTS nativo)
DO $$
BEGIN
    ALTER TABLE verificacoes
        ADD CONSTRAINT fk_verificacoes_adjusted_by_profile
        FOREIGN KEY (adjusted_by_profile_id) REFERENCES security_profiles(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;
