-- Produtos e gastos fixos são desativados para preservar o histórico.
-- Seus identificadores devem ser únicos somente entre registros ativos,
-- permitindo um novo cadastro após a exclusão lógica/desativação.

ALTER TABLE produtos DROP CONSTRAINT IF EXISTS produtos_codigo_key;
ALTER TABLE gastos_fixos DROP CONSTRAINT IF EXISTS gastos_fixos_nome_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_produtos_codigo_ativo
    ON produtos (codigo)
    WHERE ativo = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_gastos_fixos_nome_ativo
    ON gastos_fixos (nome)
    WHERE ativo = true;
