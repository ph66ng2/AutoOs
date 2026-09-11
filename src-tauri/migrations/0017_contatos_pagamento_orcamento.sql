-- 0017: contatos de cliente, snapshots do responsável e forma de pagamento.
-- Não há backfill: contatos antigos não são inferidos de observações ou nomes.

CREATE TABLE IF NOT EXISTS cliente_contatos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cliente_contatos_empresa
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente_contatos_cliente
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT,
    CONSTRAINT chk_cliente_contatos_nome_not_blank
        CHECK (BTRIM(nome) <> '')
);

CREATE INDEX IF NOT EXISTS idx_cliente_contatos_empresa
    ON cliente_contatos (empresa_id);

CREATE INDEX IF NOT EXISTS idx_cliente_contatos_cliente
    ON cliente_contatos (cliente_id);

CREATE INDEX IF NOT EXISTS idx_cliente_contatos_ativos
    ON cliente_contatos (empresa_id, cliente_id, nome)
    WHERE ativo = true;

ALTER TABLE cliente_contatos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policy
        WHERE polname = 'cliente_contatos_isolamento'
          AND polrelid = 'cliente_contatos'::regclass
    ) THEN
        CREATE POLICY cliente_contatos_isolamento ON cliente_contatos
            FOR ALL
            USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
            WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);
    END IF;
END $$;

ALTER TABLE equipamentos
    ADD COLUMN IF NOT EXISTS responsavel_contato_id INTEGER,
    ADD COLUMN IF NOT EXISTS responsavel_nome TEXT,
    ADD COLUMN IF NOT EXISTS responsavel_email TEXT,
    ADD COLUMN IF NOT EXISTS responsavel_telefone TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_equipamentos_responsavel_contato'
          AND conrelid = 'equipamentos'::regclass
    ) THEN
        ALTER TABLE equipamentos
            ADD CONSTRAINT fk_equipamentos_responsavel_contato
            FOREIGN KEY (responsavel_contato_id)
            REFERENCES cliente_contatos(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_equipamentos_responsavel_contato
    ON equipamentos (responsavel_contato_id)
    WHERE responsavel_contato_id IS NOT NULL;

ALTER TABLE verificacoes
    ADD COLUMN IF NOT EXISTS forma_pagamento_codigo TEXT,
    ADD COLUMN IF NOT EXISTS forma_pagamento_detalhe TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_verificacoes_forma_pagamento_codigo'
          AND conrelid = 'verificacoes'::regclass
    ) THEN
        ALTER TABLE verificacoes
            ADD CONSTRAINT chk_verificacoes_forma_pagamento_codigo
            CHECK (
                forma_pagamento_codigo IS NULL
                OR forma_pagamento_codigo IN (
                    'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO',
                    'DINHEIRO', 'TRANSFERENCIA', 'A_COMBINAR', 'OUTRO'
                )
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_verificacoes_forma_pagamento_outro_detalhe'
          AND conrelid = 'verificacoes'::regclass
    ) THEN
        ALTER TABLE verificacoes
            ADD CONSTRAINT chk_verificacoes_forma_pagamento_outro_detalhe
            CHECK (
                forma_pagamento_codigo IS DISTINCT FROM 'OUTRO'
                OR NULLIF(BTRIM(forma_pagamento_detalhe), '') IS NOT NULL
            );
    END IF;
END $$;
