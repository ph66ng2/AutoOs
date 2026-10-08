-- Inventário de estoque BMITAG (etiquetas, ribbons e acessórios).
-- Inventário original: migration 0020; categorias atuais: migration 0021.
-- Reaplicação manual do inventário para uma empresa explícita.
-- Valores informados entram como preço
-- unitário em preco_custo e preco_venda. Itens sem preço usam 0,00 e
-- ficam descritos como "Preço unitário não informado".

\if :{?company_id}
\else
\echo 'Informe company_id para aplicar o inventário.'
\quit 3
\endif

BEGIN;
SELECT pg_advisory_xact_lock(928354661);

CREATE TEMP TABLE autoos_stock_seed ON COMMIT DROP AS
SELECT codigo, nome, descricao, categoria, quantidade_estoque,
       quantidade_minima, quantidade_maxima, unidade_medida,
       preco_custo, preco_venda, margem_lucro, ativo
  FROM produtos WHERE false;

INSERT INTO autoos_stock_seed (
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
    ativo
)
VALUES
    ('ETQ-100X50-COUCHE', '100x50 Couchê', 'Etiqueta couchê', 'ETIQUETA', 31, 5, 50, 'UN', 46.00, 46.00, 0, true),
    ('ETQ-32X18X3-TRANS-BOPP', '32x18x03 BOPP Transparente', 'Etiqueta BOPP transparente, 3 colunas', 'ETIQUETA', 4, 5, 50, 'UN', 58.00, 58.00, 0, true),
    ('ETQ-102X51-TRANS-BOPP', '102x51 BOPP Transparente', 'Etiqueta BOPP transparente', 'ETIQUETA', 11, 5, 50, 'UN', 61.00, 61.00, 0, true),
    ('ETQ-100X70-BOPP', '100x70 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 3, 5, 50, 'UN', 61.00, 61.00, 0, true),
    ('ETQ-50X40X2-TRANS-BOPP', '50x40 BOPP Transparente', 'Etiqueta BOPP transparente', 'ETIQUETA', 2, 5, 50, 'UN', 64.00, 64.00, 0, true),
    ('ETQ-100X150-BOPP', '100x150 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 9, 5, 50, 'UN', 69.00, 69.00, 0, true),
    ('ETQ-45X20X2-LACRE-ELMECO', '45x20x02 Lacre Padrão Elmeco', 'Preço unitário não informado', 'ETIQUETA', 6, 5, 50, 'UN', 0.00, 0.00, 0, true),
    ('ETQ-32X18X5-BOPP', '32x18x05 BOPP', 'Etiqueta BOPP, 5 colunas', 'ETIQUETA', 6, 5, 50, 'UN', 59.00, 59.00, 0, true),
    ('ETQ-100X65-BOPP', '100x65 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 5, 5, 50, 'UN', 58.00, 58.00, 0, true),
    ('ETQ-100X40-BOPP', '100x40 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 3, 5, 50, 'UN', 56.00, 56.00, 0, true),
    ('ETQ-100X70-COUCHE', '100x70 Couchê', 'Etiqueta couchê', 'ETIQUETA', 2, 5, 50, 'UN', 47.00, 47.00, 0, true),
    ('ETQ-40X33-PRATA', '40x33 Prata', 'Etiqueta prata', 'ETIQUETA', 8, 5, 50, 'UN', 220.00, 220.00, 0, true),
    ('ETQ-20X25X3-BOPP', '20x25x03 BOPP', 'Etiqueta BOPP, 3 colunas', 'ETIQUETA', 4, 5, 50, 'UN', 55.00, 55.00, 0, true),
    ('ETQ-30X30-BOPP', '30x30 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 2, 5, 50, 'UN', 48.00, 48.00, 0, true),
    ('ETQ-50X20-BOPP', '50x20 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 4, 5, 50, 'UN', 50.00, 50.00, 0, true),
    ('ETQ-50X50X20-BOPP', '50x50x20 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 1, 5, 50, 'UN', 58.00, 58.00, 0, true),
    ('ETQ-100X50-BOPP', '100x50 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 2, 5, 50, 'UN', 50.00, 50.00, 0, true),
    ('ETQ-45X20-BOPP', '45x20 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 1, 5, 50, 'UN', 48.00, 48.00, 0, true),
    ('ETQ-35X70X3-CARTAO-ROUPA', '35x70x03 Papel Cartão Roupa', 'Etiqueta papel cartão', 'ETIQUETA', 11, 5, 50, 'UN', 42.00, 42.00, 0, true),
    ('ETQ-70X125X01-BOPP-3POL', '70x125 BOPP 3 Pol.', 'Etiqueta BOPP 3 polegadas', 'ETIQUETA', 22, 5, 50, 'UN', 71.00, 71.00, 0, true),
    ('ETQ-100X50-BOPP-3POL', '100x50 BOPP 3 Pol.', 'Etiqueta BOPP 3 polegadas', 'ETIQUETA', 8, 5, 50, 'UN', 58.00, 58.00, 0, true),
    ('ETQ-28X80-COUCHE-DYMO', '28x80 Couchê DYMO', 'Etiqueta couchê DYMO', 'ETIQUETA', 15, 5, 50, 'UN', 46.00, 46.00, 0, true),
    ('ETQ-70X30-COUCHE-3POL', '70x30 Couchê 3 Pol.', 'Etiqueta couchê 3 polegadas', 'ETIQUETA', 9, 5, 50, 'UN', 68.00, 68.00, 0, true),
    ('ETQ-50X70X2-BOPP-3POL', '50x70x02 BOPP 3 Pol.', 'Etiqueta BOPP 3 polegadas, 2 colunas', 'ETIQUETA', 11, 5, 50, 'UN', 76.00, 76.00, 0, true),
    ('ETQ-90X60-GONDOLA-AM-3POL', '90x60 Gôndola Amarela 3 Pol.', 'Etiqueta gôndola amarela 3 polegadas', 'ETIQUETA', 4, 5, 50, 'UN', 65.00, 65.00, 0, true),
    ('RIB-CERA-110X450', 'Ribbon Cera 110x450m', 'Ribbon cera 110x450m', 'RIBBON', 18, 5, 50, 'UN', 76.00, 76.00, 0, true),
    ('RIB-RESINA', 'Ribbon Resina 110x450m', 'Ribbon resina 110x450m', 'RIBBON', 8, 5, 50, 'UN', 280.00, 280.00, 0, true),
    ('RIB-ZXP1-COLOR', 'Ribbon ZXP1 Color', 'Ribbon colorido ZXP1', 'RIBBON', 11, 5, 50, 'UN', 300.00, 300.00, 0, true),
    ('RIB-ZXP1-MONO', 'Ribbon ZXP1 Mono', 'Ribbon monocromático ZXP1', 'RIBBON', 2, 5, 50, 'UN', 200.00, 200.00, 0, true),
    ('RIB-ZC300-MONO', 'Ribbon ZC300 Mono', 'Ribbon monocromático ZC300', 'RIBBON', 1, 5, 50, 'UN', 310.00, 310.00, 0, true),
    ('PEC-CANETA-LIMPEZA', 'Caneta de Limpeza', 'Acessório de limpeza', 'PEÇA', 1, 5, 50, 'UN', 40.00, 40.00, 0, true),
    ('ETQ-17X152X5-COUCHE', '17x152x05 Couchê', 'Etiqueta couchê, 5 colunas', 'ETIQUETA', 9, 5, 50, 'UN', 46.00, 46.00, 0, true),
    ('ETQ-80X50-COUCHE-AZUL', '80x50 Couchê Azul', 'Etiqueta couchê azul', 'ETIQUETA', 3, 5, 50, 'UN', 42.00, 42.00, 0, true),
    ('ETQ-50X120X2-COUCHE', '50x120x02 Couchê', 'Etiqueta couchê, 2 colunas', 'ETIQUETA', 3, 5, 50, 'UN', 46.00, 46.00, 0, true),
    ('ETQ-50X160X2-COUCHE', '50x160x02 Couchê', 'Etiqueta couchê, 2 colunas', 'ETIQUETA', 1, 5, 50, 'UN', 47.00, 47.00, 0, true),
    ('ETQ-50X28-COUCHE-AMARELA', '50x28 Couchê Amarela', 'Etiqueta couchê amarela', 'ETIQUETA', 4, 5, 50, 'UN', 42.00, 42.00, 0, true),
    ('ETQ-100X30-GONDOLA', '100x30 Gôndola', 'Etiqueta gôndola', 'ETIQUETA', 7, 5, 50, 'UN', 42.00, 42.00, 0, true),
    ('ETQ-100X40-GONDOLA-LARANJA', '100x40 Gôndola Laranja', 'Etiqueta gôndola laranja', 'ETIQUETA', 5, 5, 50, 'UN', 44.00, 44.00, 0, true),
    ('ETQ-33X22X3-COUCHE', '33x22x03 Couchê', 'Etiqueta couchê, 3 colunas', 'ETIQUETA', 2, 5, 50, 'UN', 46.00, 46.00, 0, true),
    ('ETQ-33X22X3-AMARELA', '33x22x03 Amarela', 'Preço unitário não informado', 'ETIQUETA', 1, 5, 50, 'UN', 0.00, 0.00, 0, true),
    ('ETQ-75X30-GONDOLA-LARANJA', '75x30 Gôndola Laranja', 'Etiqueta gôndola laranja', 'ETIQUETA', 2, 5, 50, 'UN', 42.00, 42.00, 0, true),
    ('ETQ-80X70-BOPP', '80x70 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 1, 5, 50, 'UN', 56.00, 56.00, 0, true)
;

UPDATE produtos AS product
   SET nome = seed.nome,
       descricao = seed.descricao,
       categoria = seed.categoria,
       quantidade_estoque = seed.quantidade_estoque,
       quantidade_minima = seed.quantidade_minima,
       quantidade_maxima = seed.quantidade_maxima,
       unidade_medida = seed.unidade_medida,
       preco_custo = seed.preco_custo,
       preco_venda = seed.preco_venda,
       margem_lucro = seed.margem_lucro,
       atualizado_em = CURRENT_TIMESTAMP
  FROM autoos_stock_seed AS seed
 WHERE product.empresa_id::text = :'company_id'
   AND product.codigo = seed.codigo
   AND product.ativo = true;

INSERT INTO produtos (
    empresa_id, codigo, nome, descricao, categoria, quantidade_estoque,
    quantidade_minima, quantidade_maxima, unidade_medida,
    preco_custo, preco_venda, margem_lucro, ativo
)
SELECT company.id, seed.codigo, seed.nome, seed.descricao, seed.categoria,
       seed.quantidade_estoque, seed.quantidade_minima, seed.quantidade_maxima,
       seed.unidade_medida, seed.preco_custo, seed.preco_venda,
       seed.margem_lucro, true
  FROM autoos_stock_seed AS seed
  JOIN empresas AS company ON company.id::text = :'company_id'
 WHERE NOT EXISTS (
    SELECT 1 FROM produtos AS existing
     WHERE existing.empresa_id = company.id
       AND existing.codigo = seed.codigo
       AND existing.ativo = true
 );

SELECT (SELECT COUNT(*) FROM autoos_stock_seed) =
       (SELECT COUNT(*) FROM produtos AS product
         JOIN autoos_stock_seed AS seed ON seed.codigo = product.codigo
        WHERE product.empresa_id::text = :'company_id' AND product.ativo = true)
       AS seed_ok \gset
\if :seed_ok
COMMIT;
\echo 'Inventário aplicado à empresa selecionada.'
\else
ROLLBACK;
\echo 'Empresa não encontrada ou inventário incompleto.'
\quit 3
\endif
