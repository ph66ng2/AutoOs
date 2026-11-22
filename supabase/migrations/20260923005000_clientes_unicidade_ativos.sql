-- A exclusão lógica preserva o histórico, mas libera o documento para recadastro.
-- Cria a proteção nova antes de remover as constraints antigas para não abrir
-- uma janela sem unicidade entre clientes ativos da mesma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_empresa_documento_ativo
    ON public.clientes (empresa_id, documento)
    WHERE ativo = true AND documento IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_empresa_cpf_cnpj_ativo
    ON public.clientes (empresa_id, cpf_cnpj)
    WHERE ativo = true AND cpf_cnpj IS NOT NULL;

ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS uq_clientes_empresa_documento;
ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS uq_clientes_empresa_cpf_cnpj;
