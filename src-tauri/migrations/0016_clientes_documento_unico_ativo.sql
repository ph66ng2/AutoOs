-- Clientes excluídos são preservados com ativo = false para manter histórico.
-- CPF/CNPJ só precisa ser único entre cadastros ativos, permitindo reativar o
-- relacionamento comercial por meio de um novo cadastro após exclusão lógica.

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_documento_key;
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_cpf_cnpj_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_documento_ativo
    ON clientes (documento)
    WHERE ativo = true AND documento IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_cpf_cnpj_ativo
    ON clientes (cpf_cnpj)
    WHERE ativo = true AND cpf_cnpj IS NOT NULL;
