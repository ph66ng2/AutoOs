-- Contrato de contatos Online. A tabela já existe no schema de bootstrap,
-- mas ainda não em todos os projetos de staging; não inferir contatos antigos.
CREATE TABLE IF NOT EXISTS public.cliente_contatos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    cliente_id uuid NOT NULL,
    nome text NOT NULL,
    email text,
    telefone text,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_cliente_contatos_nome_not_blank CHECK (btrim(nome) <> '')
);

ALTER TABLE public.cliente_contatos ALTER COLUMN empresa_id DROP DEFAULT;

-- A FK simples do bootstrap não impede apontar para um cliente de outro tenant.
ALTER TABLE public.cliente_contatos DROP CONSTRAINT IF EXISTS fk_cliente_contatos_cliente;
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.cliente_contatos'::regclass
           AND conname = 'fk_cliente_contatos_cliente_empresa'
    ) THEN
        ALTER TABLE public.cliente_contatos
            ADD CONSTRAINT fk_cliente_contatos_cliente_empresa
            FOREIGN KEY (empresa_id, cliente_id)
            REFERENCES public.clientes(empresa_id, id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cliente_contatos_ativos
    ON public.cliente_contatos (empresa_id, cliente_id, nome)
    WHERE ativo = true;

ALTER TABLE public.cliente_contatos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cliente_contatos FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cliente_contatos TO authenticated;

DROP POLICY IF EXISTS company_select ON public.cliente_contatos;
DROP POLICY IF EXISTS company_insert ON public.cliente_contatos;
DROP POLICY IF EXISTS company_update ON public.cliente_contatos;
DROP POLICY IF EXISTS company_delete ON public.cliente_contatos;
CREATE POLICY company_select ON public.cliente_contatos
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT public.current_company_id()));
CREATE POLICY company_insert ON public.cliente_contatos
    FOR INSERT TO authenticated
    WITH CHECK (empresa_id = (SELECT public.current_company_id()));
CREATE POLICY company_update ON public.cliente_contatos
    FOR UPDATE TO authenticated
    USING (empresa_id = (SELECT public.current_company_id()))
    WITH CHECK (empresa_id = (SELECT public.current_company_id()));
