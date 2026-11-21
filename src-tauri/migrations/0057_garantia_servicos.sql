-- Prazo de garantia dos serviços (dias contados da entrega), por instalação. A Nova entrada usa
-- para avisar que uma impressora voltou dentro da garantia; nada é marcado sozinho como garantia.
ALTER TABLE configuracoes_sistema ADD COLUMN IF NOT EXISTS garantia_servicos_dias INTEGER NOT NULL DEFAULT 90;

DO $$
BEGIN
    ALTER TABLE configuracoes_sistema
        ADD CONSTRAINT configuracoes_sistema_garantia_dias_check CHECK (garantia_servicos_dias BETWEEN 0 AND 3650);
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;
