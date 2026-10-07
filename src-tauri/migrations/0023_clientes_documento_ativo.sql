-- Substitui as unicidades globais legadas pelos índices usados no cadastro.
-- Cadastros inativos não impedem um novo registro com o mesmo documento.
-- Mantém os nomes já usados em bancos que receberam a correção manualmente.
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_documento_key;
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_cpf_cnpj_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_documento_ativo
    ON clientes (documento)
    WHERE ativo = true AND documento IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_cpf_cnpj_ativo
    ON clientes (cpf_cnpj)
    WHERE ativo = true AND cpf_cnpj IS NOT NULL;
