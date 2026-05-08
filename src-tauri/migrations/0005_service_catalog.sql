CREATE TABLE IF NOT EXISTS servicos_catalogo (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    preco_padrao NUMERIC NOT NULL,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_servicos_catalogo_nome_not_blank
        CHECK (BTRIM(nome) <> ''),
    CONSTRAINT chk_servicos_catalogo_preco_non_negative
        CHECK (preco_padrao >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_servicos_catalogo_nome_ativo
    ON servicos_catalogo (LOWER(BTRIM(nome)))
    WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_servicos_catalogo_ativos_nome
    ON servicos_catalogo (ativo, nome);
