-- Impede novos registros sem tenant sem reescrever os legados do 0.5.0.
-- NOT VALID preserva as linhas históricas existentes; PostgreSQL ainda aplica
-- a regra a todo INSERT e UPDATE posterior.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_clientes_empresa_required_new'
          AND conrelid = 'clientes'::regclass
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT chk_clientes_empresa_required_new
            CHECK (empresa_id IS NOT NULL) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_equipamentos_empresa_required_new'
          AND conrelid = 'equipamentos'::regclass
    ) THEN
        ALTER TABLE equipamentos
            ADD CONSTRAINT chk_equipamentos_empresa_required_new
            CHECK (empresa_id IS NOT NULL) NOT VALID;
    END IF;
END $$;
