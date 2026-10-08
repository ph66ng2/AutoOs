-- O código de produto é único apenas dentro da empresa ativa.
-- Substitui o índice global criado pela 0024 sem editar migrations aplicadas.
DROP INDEX IF EXISTS ux_produtos_codigo_ativo;

CREATE UNIQUE INDEX IF NOT EXISTS ux_produtos_empresa_codigo_ativo
    ON produtos (empresa_id, codigo)
    WHERE ativo = true;
