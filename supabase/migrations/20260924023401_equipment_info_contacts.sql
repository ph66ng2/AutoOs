-- Completa o contrato da aba Informações sem inferir dados nem reescrever
-- snapshots históricos. Esta migration é versionada; não deve ser aplicada
-- diretamente a Staging/Produção durante o desenvolvimento do ticket.

ALTER TABLE public.equipamentos
    ADD COLUMN IF NOT EXISTS cliente_documento text,
    ADD COLUMN IF NOT EXISTS responsavel_contato_id uuid,
    ADD COLUMN IF NOT EXISTS responsavel_nome text,
    ADD COLUMN IF NOT EXISTS responsavel_email text,
    ADD COLUMN IF NOT EXISTS responsavel_telefone text;

-- A relação do responsável é específica do mesmo tenant e cliente do
-- equipamento. A unique composta serve de alvo para a FK e os índices abaixo
-- mantêm verificações de integridade eficientes. NOT VALID preserva linhas
-- legadas já gravadas, mas aplica a regra a novos vínculos e alterações.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.cliente_contatos'::regclass
           AND conname = 'uq_cliente_contatos_empresa_cliente_id'
    ) THEN
        ALTER TABLE public.cliente_contatos
            ADD CONSTRAINT uq_cliente_contatos_empresa_cliente_id
            UNIQUE (empresa_id, cliente_id, id);
    END IF;
END $$;

ALTER TABLE public.equipamentos
    DROP CONSTRAINT IF EXISTS fk_equipamentos_responsavel_contato;
ALTER TABLE public.equipamentos
    DROP CONSTRAINT IF EXISTS equipamentos_responsavel_contato_id_fkey;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.equipamentos'::regclass
           AND conname = 'fk_equipamentos_responsavel_cliente_empresa'
    ) THEN
        ALTER TABLE public.equipamentos
            ADD CONSTRAINT fk_equipamentos_responsavel_cliente_empresa
            FOREIGN KEY (empresa_id, cliente_id, responsavel_contato_id)
            REFERENCES public.cliente_contatos (empresa_id, cliente_id, id)
            ON DELETE SET NULL (responsavel_contato_id)
            NOT VALID;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.equipamentos'::regclass
           AND conname = 'chk_equipamentos_responsavel_requires_cliente'
    ) THEN
        ALTER TABLE public.equipamentos
            ADD CONSTRAINT chk_equipamentos_responsavel_requires_cliente
            CHECK (responsavel_contato_id IS NULL OR cliente_id IS NOT NULL)
            NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_equipamentos_empresa_cliente
    ON public.equipamentos (empresa_id, cliente_id)
    WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_equipamentos_responsavel_tenant_cliente
    ON public.equipamentos (empresa_id, cliente_id, responsavel_contato_id)
    WHERE responsavel_contato_id IS NOT NULL;

-- cliente_contatos já possui RLS tenant-safe e política company_* na migration
-- 20260923135918; repetir os privilégios explícitos mantém Data API liberada
-- apenas para authenticated, conforme a configuração atual do projeto.
REVOKE ALL ON TABLE public.cliente_contatos FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cliente_contatos TO authenticated;
