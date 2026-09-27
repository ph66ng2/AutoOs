-- Estoque único compartilhado com o AutoBO. A categoria é um agrupamento operacional.
UPDATE produtos SET categoria = CASE
    -- A migration 0020 usava ROLO para as etiquetas do inventário ETQ-*.
    WHEN UPPER(BTRIM(categoria)) = 'ROLO' AND codigo LIKE 'ETQ-%' THEN 'ETIQUETA'
    WHEN UPPER(BTRIM(categoria)) IN ('TONER', 'CARTUCHO', 'RIBBON') THEN 'RIBBON'
    WHEN UPPER(BTRIM(categoria)) IN ('PEÇA', 'PECA', 'FUSOR', 'CILINDRO', 'ROLO') THEN 'PEÇA'
    WHEN UPPER(BTRIM(categoria)) = 'IMPRESSORA' THEN 'IMPRESSORA'
    WHEN UPPER(BTRIM(categoria)) = 'ETIQUETA' THEN 'ETIQUETA'
    ELSE 'OUTROS'
END
WHERE categoria NOT IN ('IMPRESSORA', 'PEÇA', 'ETIQUETA', 'RIBBON', 'OUTROS');

ALTER TABLE servicos_catalogo ADD COLUMN IF NOT EXISTS pecas_sugeridas JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE verificacoes ADD COLUMN IF NOT EXISTS servicos_orcamento_original JSONB;
ALTER TABLE verificacoes ADD COLUMN IF NOT EXISTS pecas_orcamento_original JSONB;
ALTER TABLE verificacoes ADD COLUMN IF NOT EXISTS valor_orcamento_original NUMERIC;

CREATE TABLE IF NOT EXISTS orcamento_servicos_decisao (
    verificacao_id INTEGER NOT NULL REFERENCES verificacoes(id) ON DELETE CASCADE,
    servico_id TEXT NOT NULL,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    decisao TEXT NOT NULL CHECK (decisao IN ('APROVADO', 'REPROVADO')),
    decidido_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (verificacao_id, servico_id)
);
CREATE INDEX IF NOT EXISTS idx_orcamento_decisao_empresa ON orcamento_servicos_decisao(empresa_id);

CREATE TABLE IF NOT EXISTS orcamento_consumos (
    verificacao_id INTEGER NOT NULL REFERENCES verificacoes(id) ON DELETE CASCADE,
    servico_id TEXT NOT NULL,
    produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id),
    quantidade_aprovada INTEGER NOT NULL CHECK (quantidade_aprovada >= 0),
    quantidade_baixada INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_baixada >= 0),
    PRIMARY KEY (verificacao_id, servico_id, produto_id),
    CHECK (quantidade_baixada <= quantidade_aprovada)
);
CREATE INDEX IF NOT EXISTS idx_orcamento_consumos_pendentes ON orcamento_consumos(empresa_id, verificacao_id)
    WHERE quantidade_baixada < quantidade_aprovada;
CREATE INDEX IF NOT EXISTS idx_orcamento_consumos_produto ON orcamento_consumos(produto_id);

ALTER TABLE orcamento_servicos_decisao ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_consumos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON orcamento_servicos_decisao, orcamento_consumos FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON orcamento_servicos_decisao, orcamento_consumos FROM authenticated';
    END IF;
END $$;
CREATE POLICY orcamento_decisao_empresa ON orcamento_servicos_decisao
    FOR ALL USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);
CREATE POLICY orcamento_consumos_empresa ON orcamento_consumos
    FOR ALL USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

-- Cadastros legados só podem ser vinculados automaticamente quando há uma única empresa.
UPDATE produtos SET empresa_id = (SELECT MIN(id) FROM empresas)
WHERE empresa_id IS NULL AND (SELECT COUNT(*) FROM empresas) = 1;
UPDATE movimentacoes_estoque m SET empresa_id = p.empresa_id
FROM produtos p WHERE p.id = m.produto_id AND m.empresa_id IS NULL AND p.empresa_id IS NOT NULL;
ALTER TABLE produtos ADD CONSTRAINT produtos_categoria_operacional
    CHECK (categoria IN ('IMPRESSORA', 'PEÇA', 'ETIQUETA', 'RIBBON', 'OUTROS'));
