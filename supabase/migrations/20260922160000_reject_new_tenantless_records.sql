-- Mantém eventuais legados para a ferramenta de regularização; NOT VALID
-- protege qualquer INSERT ou UPDATE novo sem reescrever dados existentes.
-- As verificações tornam a aplicação manual segura para repetição.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'clientes_empresa_required_new'
          AND conrelid = 'public.clientes'::regclass
    ) THEN
        ALTER TABLE public.clientes
            ADD CONSTRAINT clientes_empresa_required_new
            CHECK (empresa_id IS NOT NULL) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'equipamentos_empresa_required_new'
          AND conrelid = 'public.equipamentos'::regclass
    ) THEN
        ALTER TABLE public.equipamentos
            ADD CONSTRAINT equipamentos_empresa_required_new
            CHECK (empresa_id IS NOT NULL) NOT VALID;
    END IF;
END $$;
