-- Inventário inicial de ribbons e etiquetas BOPP (BMITAG).
-- Idempotente por codigo: pode ser reaplicado sem duplicar linhas.
-- Os valores da planilha entram em preco_custo e preco_venda até haver
-- custo de compra separado.

INSERT INTO produtos (
    codigo,
    nome,
    descricao,
    categoria,
    quantidade_estoque,
    quantidade_minima,
    quantidade_maxima,
    unidade_medida,
    preco_custo,
    preco_venda,
    margem_lucro,
    empresa_id,
    ativo
)
VALUES
    ('RIB-CERA-110X450', 'RIBBON CERA 110X450', NULL, 'RIBBON', 1, 2, 50, 'UN', 78.00, 78.00, 0, 1, true),
    ('RIB-CERA-110X74', 'RIBBON CERA 110X74', '150 por pacote', 'RIBBON', 15, 2, 50, 'UN', 25.00, 25.00, 0, 1, true),
    ('RIB-RESINA', 'RIBBON RESINA', '280 por pacote', 'RIBBON', 8, 2, 50, 'UN', 47.00, 47.00, 0, 1, true),
    ('ETQ-100X50-BOPP-3POL', '100X50 BOPP 3POL', 'Etiqueta BOPP 3 polegadas', 'ETIQUETA', 0, 2, 50, 'UN', 58.00, 58.00, 0, 1, true),
    ('ETQ-100X65-BOPP', '100X65 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 5, 2, 50, 'UN', 58.00, 58.00, 0, 1, true),
    ('ETQ-100X50-BOPP', '100X50 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 0, 2, 50, 'UN', 58.00, 58.00, 0, 1, true),
    ('ETQ-80X25-BOPP', '80X25 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 0, 2, 50, 'UN', 53.00, 53.00, 0, 1, true),
    ('ETQ-50X20-BOPP', '50X20 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 4, 2, 50, 'UN', 49.00, 49.00, 0, 1, true),
    ('ETQ-100X40-BOPP', '100X40 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 3, 2, 50, 'UN', 55.00, 55.00, 0, 1, true),
    ('ETQ-50X50X2-BOPP', '50X50X2 BOPP', 'Etiqueta BOPP 2 colunas', 'ETIQUETA', 2, 2, 50, 'UN', 53.00, 53.00, 0, 1, true),
    ('ETQ-20X25X3-BOPP', '20X25X3 BOPP', 'Etiqueta BOPP 3 colunas', 'ETIQUETA', 4, 2, 50, 'UN', 50.00, 50.00, 0, 1, true),
    ('ETQ-30X30-BOPP', '30X30 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 2, 2, 50, 'UN', 48.00, 48.00, 0, 1, true),
    ('ETQ-70X125X01-BOPP-3POL', '70X125X01 BOPP 3POL', 'Etiqueta BOPP 3 polegadas', 'ETIQUETA', 22, 2, 50, 'UN', 69.00, 69.00, 0, 1, true),
    ('ETQ-50X70X2-BOPP-3POL', '50X70X2 BOPP 3POL', 'Etiqueta BOPP 3 polegadas, 2 colunas', 'ETIQUETA', 12, 2, 50, 'UN', 65.00, 65.00, 0, 1, true),
    ('ETQ-102X51-TRANS-BOPP', '102X51 TRANSPARENTE BOPP', 'Etiqueta BOPP transparente', 'ETIQUETA', 11, 2, 50, 'UN', 68.00, 68.00, 0, 1, true),
    ('ETQ-32X18X3-TRANS-BOPP', '32X18X3 TRANSPARENTE BOPP', 'Etiqueta BOPP transparente, 3 colunas', 'ETIQUETA', 5, 2, 50, 'UN', 65.00, 65.00, 0, 1, true),
    ('ETQ-50X40X2-TRANS-BOPP', '50X40X2 TRANSPARENTE BOPP', 'Etiqueta BOPP transparente, 2 colunas', 'ETIQUETA', 2, 2, 50, 'UN', 66.00, 66.00, 0, 1, true)
ON CONFLICT (codigo) WHERE (ativo = true) DO UPDATE SET
    nome = EXCLUDED.nome,
    descricao = EXCLUDED.descricao,
    categoria = EXCLUDED.categoria,
    quantidade_estoque = EXCLUDED.quantidade_estoque,
    quantidade_minima = EXCLUDED.quantidade_minima,
    quantidade_maxima = EXCLUDED.quantidade_maxima,
    unidade_medida = EXCLUDED.unidade_medida,
    preco_custo = EXCLUDED.preco_custo,
    preco_venda = EXCLUDED.preco_venda,
    margem_lucro = EXCLUDED.margem_lucro,
    empresa_id = EXCLUDED.empresa_id,
    ativo = true,
    atualizado_em = CURRENT_TIMESTAMP;
