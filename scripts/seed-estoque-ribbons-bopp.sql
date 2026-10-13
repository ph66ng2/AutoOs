-- Inventário de estoque BMITAG (etiquetas, ribbons e acessórios).
-- Inventário original: migration 0020; categorias atuais: migration 0021.
-- Schema alvo: migrations 0026/0027. O código ativo é único por empresa
-- (ux_produtos_empresa_codigo_ativo) e, separadamente, entre produtos ativos
-- ainda sem empresa. ON CONFLICT (codigo) não encontra índice nesse schema.
--
-- Inserção apenas dos SKUs que ainda não existem na empresa alvo, ativos ou
-- inativos. Um código desativado não ganha outra linha ativa com o saldo do
-- snapshot. Não atualiza nome, saldo, preço nem qualquer outra coluna, e não
-- lê nem apaga movimentacoes_estoque. O snapshot de quantidade e preço vale
-- só para o primeiro insert daquele código na empresa, gravado direto em
-- quantidade_estoque, sem movimentação de entrada.
--
-- Empresa alvo:
--   * seed.empresa_id, quando definido e existente (id numérico);
--   * senão, a única linha de empresas;
--   * senão, o script falha. Com várias empresas ele não escolhe sozinho.
-- Exemplo com mais de uma empresa:
--   PGOPTIONS='-c seed.empresa_id=1' psql "$URL" -v ON_ERROR_STOP=1 -f scripts/seed-estoque-ribbons-bopp.sql
-- Os produtos legados com empresa_id NULL (migration 0020) permanecem.
-- O app lista estoque pela empresa da sessão, então o seed grava a cópia
-- da empresa alvo em vez de reaproveitar essas linhas sem empresa.

DO $seed$
DECLARE
    configured text;
    target_empresa integer;
    empresa_count integer;
    snapshot_count integer;
    inserted_count integer;
    present_count integer;
BEGIN
    configured := NULLIF(BTRIM(current_setting('seed.empresa_id', true)), '');
    IF configured IS NOT NULL THEN
        IF configured !~ '^[0-9]+$' THEN
            RAISE EXCEPTION 'seed.empresa_id deve ser o id numérico de uma empresa.';
        END IF;
        SELECT id INTO target_empresa FROM empresas WHERE id = configured::integer;
        IF target_empresa IS NULL THEN
            RAISE EXCEPTION 'seed.empresa_id=% não existe em empresas.', configured;
        END IF;
    ELSE
        SELECT COUNT(*)::integer INTO empresa_count FROM empresas;
        IF empresa_count = 1 THEN
            SELECT id INTO target_empresa FROM empresas;
        ELSIF empresa_count = 0 THEN
            RAISE EXCEPTION 'Nenhuma empresa cadastrada. Cadastre a empresa ou defina seed.empresa_id antes de aplicar o seed.';
        ELSE
            RAISE EXCEPTION 'Há % empresas. Defina seed.empresa_id com o id da empresa alvo. O seed não escolhe uma empresa sozinho.', empresa_count;
        END IF;
    END IF;

    PERFORM set_config('app.empresa_id', target_empresa::text, true);

    CREATE TEMP TABLE seed_inventario_snapshot (
        codigo text PRIMARY KEY,
        nome text NOT NULL,
        descricao text,
        categoria text NOT NULL,
        quantidade_estoque integer NOT NULL,
        quantidade_minima integer NOT NULL,
        quantidade_maxima integer NOT NULL,
        unidade_medida text NOT NULL,
        preco_custo numeric NOT NULL,
        preco_venda numeric NOT NULL,
        margem_lucro numeric NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO seed_inventario_snapshot (
        codigo, nome, descricao, categoria,
        quantidade_estoque, quantidade_minima, quantidade_maxima,
        unidade_medida, preco_custo, preco_venda, margem_lucro
    )
    VALUES
        ('ETQ-100X50-COUCHE', '100x50 Couchê', 'Etiqueta couchê', 'ETIQUETA', 31, 5, 50, 'UN', 46.00, 46.00, 0),
        ('ETQ-32X18X3-TRANS-BOPP', '32x18x03 BOPP Transparente', 'Etiqueta BOPP transparente, 3 colunas', 'ETIQUETA', 4, 5, 50, 'UN', 58.00, 58.00, 0),
        ('ETQ-102X51-TRANS-BOPP', '102x51 BOPP Transparente', 'Etiqueta BOPP transparente', 'ETIQUETA', 11, 5, 50, 'UN', 61.00, 61.00, 0),
        ('ETQ-100X70-BOPP', '100x70 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 3, 5, 50, 'UN', 61.00, 61.00, 0),
        ('ETQ-50X40X2-TRANS-BOPP', '50x40 BOPP Transparente', 'Etiqueta BOPP transparente', 'ETIQUETA', 2, 5, 50, 'UN', 64.00, 64.00, 0),
        ('ETQ-100X150-BOPP', '100x150 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 9, 5, 50, 'UN', 69.00, 69.00, 0),
        ('ETQ-45X20X2-LACRE-ELMECO', '45x20x02 Lacre Padrão Elmeco', 'Preço unitário não informado', 'ETIQUETA', 6, 5, 50, 'UN', 0.00, 0.00, 0),
        ('ETQ-32X18X5-BOPP', '32x18x05 BOPP', 'Etiqueta BOPP, 5 colunas', 'ETIQUETA', 6, 5, 50, 'UN', 59.00, 59.00, 0),
        ('ETQ-100X65-BOPP', '100x65 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 5, 5, 50, 'UN', 58.00, 58.00, 0),
        ('ETQ-100X40-BOPP', '100x40 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 3, 5, 50, 'UN', 56.00, 56.00, 0),
        ('ETQ-100X70-COUCHE', '100x70 Couchê', 'Etiqueta couchê', 'ETIQUETA', 2, 5, 50, 'UN', 47.00, 47.00, 0),
        ('ETQ-40X33-PRATA', '40x33 Prata', 'Etiqueta prata', 'ETIQUETA', 8, 5, 50, 'UN', 220.00, 220.00, 0),
        ('ETQ-20X25X3-BOPP', '20x25x03 BOPP', 'Etiqueta BOPP, 3 colunas', 'ETIQUETA', 4, 5, 50, 'UN', 55.00, 55.00, 0),
        ('ETQ-30X30-BOPP', '30x30 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 2, 5, 50, 'UN', 48.00, 48.00, 0),
        ('ETQ-50X20-BOPP', '50x20 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 4, 5, 50, 'UN', 50.00, 50.00, 0),
        ('ETQ-50X50X20-BOPP', '50x50x20 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 1, 5, 50, 'UN', 58.00, 58.00, 0),
        ('ETQ-100X50-BOPP', '100x50 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 2, 5, 50, 'UN', 50.00, 50.00, 0),
        ('ETQ-45X20-BOPP', '45x20 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 1, 5, 50, 'UN', 48.00, 48.00, 0),
        ('ETQ-35X70X3-CARTAO-ROUPA', '35x70x03 Papel Cartão Roupa', 'Etiqueta papel cartão', 'ETIQUETA', 11, 5, 50, 'UN', 42.00, 42.00, 0),
        ('ETQ-70X125X01-BOPP-3POL', '70x125 BOPP 3 Pol.', 'Etiqueta BOPP 3 polegadas', 'ETIQUETA', 22, 5, 50, 'UN', 71.00, 71.00, 0),
        ('ETQ-100X50-BOPP-3POL', '100x50 BOPP 3 Pol.', 'Etiqueta BOPP 3 polegadas', 'ETIQUETA', 8, 5, 50, 'UN', 58.00, 58.00, 0),
        ('ETQ-28X80-COUCHE-DYMO', '28x80 Couchê DYMO', 'Etiqueta couchê DYMO', 'ETIQUETA', 15, 5, 50, 'UN', 46.00, 46.00, 0),
        ('ETQ-70X30-COUCHE-3POL', '70x30 Couchê 3 Pol.', 'Etiqueta couchê 3 polegadas', 'ETIQUETA', 9, 5, 50, 'UN', 68.00, 68.00, 0),
        ('ETQ-50X70X2-BOPP-3POL', '50x70x02 BOPP 3 Pol.', 'Etiqueta BOPP 3 polegadas, 2 colunas', 'ETIQUETA', 11, 5, 50, 'UN', 76.00, 76.00, 0),
        ('ETQ-90X60-GONDOLA-AM-3POL', '90x60 Gôndola Amarela 3 Pol.', 'Etiqueta gôndola amarela 3 polegadas', 'ETIQUETA', 4, 5, 50, 'UN', 65.00, 65.00, 0),
        ('RIB-CERA-110X450', 'Ribbon Cera 110x450m', 'Ribbon cera 110x450m', 'RIBBON', 18, 5, 50, 'UN', 76.00, 76.00, 0),
        ('RIB-RESINA', 'Ribbon Resina 110x450m', 'Ribbon resina 110x450m', 'RIBBON', 8, 5, 50, 'UN', 280.00, 280.00, 0),
        ('RIB-ZXP1-COLOR', 'Ribbon ZXP1 Color', 'Ribbon colorido ZXP1', 'RIBBON', 11, 5, 50, 'UN', 300.00, 300.00, 0),
        ('RIB-ZXP1-MONO', 'Ribbon ZXP1 Mono', 'Ribbon monocromático ZXP1', 'RIBBON', 2, 5, 50, 'UN', 200.00, 200.00, 0),
        ('RIB-ZC300-MONO', 'Ribbon ZC300 Mono', 'Ribbon monocromático ZC300', 'RIBBON', 1, 5, 50, 'UN', 310.00, 310.00, 0),
        ('PEC-CANETA-LIMPEZA', 'Caneta de Limpeza', 'Acessório de limpeza', 'PEÇA', 1, 5, 50, 'UN', 40.00, 40.00, 0),
        ('ETQ-17X152X5-COUCHE', '17x152x05 Couchê', 'Etiqueta couchê, 5 colunas', 'ETIQUETA', 9, 5, 50, 'UN', 46.00, 46.00, 0),
        ('ETQ-80X50-COUCHE-AZUL', '80x50 Couchê Azul', 'Etiqueta couchê azul', 'ETIQUETA', 3, 5, 50, 'UN', 42.00, 42.00, 0),
        ('ETQ-50X120X2-COUCHE', '50x120x02 Couchê', 'Etiqueta couchê, 2 colunas', 'ETIQUETA', 3, 5, 50, 'UN', 46.00, 46.00, 0),
        ('ETQ-50X160X2-COUCHE', '50x160x02 Couchê', 'Etiqueta couchê, 2 colunas', 'ETIQUETA', 1, 5, 50, 'UN', 47.00, 47.00, 0),
        ('ETQ-50X28-COUCHE-AMARELA', '50x28 Couchê Amarela', 'Etiqueta couchê amarela', 'ETIQUETA', 4, 5, 50, 'UN', 42.00, 42.00, 0),
        ('ETQ-100X30-GONDOLA', '100x30 Gôndola', 'Etiqueta gôndola', 'ETIQUETA', 7, 5, 50, 'UN', 42.00, 42.00, 0),
        ('ETQ-100X40-GONDOLA-LARANJA', '100x40 Gôndola Laranja', 'Etiqueta gôndola laranja', 'ETIQUETA', 5, 5, 50, 'UN', 44.00, 44.00, 0),
        ('ETQ-33X22X3-COUCHE', '33x22x03 Couchê', 'Etiqueta couchê, 3 colunas', 'ETIQUETA', 2, 5, 50, 'UN', 46.00, 46.00, 0),
        ('ETQ-33X22X3-AMARELA', '33x22x03 Amarela', 'Preço unitário não informado', 'ETIQUETA', 1, 5, 50, 'UN', 0.00, 0.00, 0),
        ('ETQ-75X30-GONDOLA-LARANJA', '75x30 Gôndola Laranja', 'Etiqueta gôndola laranja', 'ETIQUETA', 2, 5, 50, 'UN', 42.00, 42.00, 0),
        ('ETQ-80X70-BOPP', '80x70 BOPP', 'Etiqueta BOPP', 'ETIQUETA', 1, 5, 50, 'UN', 56.00, 56.00, 0);

    SELECT COUNT(*)::integer INTO snapshot_count FROM seed_inventario_snapshot;
    IF snapshot_count <> 42 THEN
        RAISE EXCEPTION 'O snapshot do seed deixou de ter 42 SKUs (encontrados %).', snapshot_count;
    END IF;

    INSERT INTO produtos (
        empresa_id,
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
    SELECT
        target_empresa,
        snapshot.codigo,
        snapshot.nome,
        snapshot.descricao,
        snapshot.categoria,
        snapshot.quantidade_estoque,
        snapshot.quantidade_minima,
        snapshot.quantidade_maxima,
        snapshot.unidade_medida,
        snapshot.preco_custo,
        snapshot.preco_venda,
        snapshot.margem_lucro,
        true
    FROM seed_inventario_snapshot AS snapshot
    WHERE NOT EXISTS (
        SELECT 1
        FROM produtos AS existente
        WHERE existente.empresa_id = target_empresa
          AND existente.codigo = snapshot.codigo
    );

    GET DIAGNOSTICS inserted_count = ROW_COUNT;

    SELECT COUNT(*)::integer INTO present_count
    FROM seed_inventario_snapshot AS snapshot
    WHERE EXISTS (
        SELECT 1
        FROM produtos AS produto
        WHERE produto.empresa_id = target_empresa
          AND produto.codigo = snapshot.codigo
    );

    IF present_count <> snapshot_count THEN
        RAISE EXCEPTION 'A empresa % ficou com % SKUs do inventário; esperados %.', target_empresa, present_count, snapshot_count;
    END IF;

    RAISE NOTICE 'Seed de estoque: empresa %, inseridos agora %, presentes no inventário %. Saldos, preços, inativos e movimentações existentes não foram alterados. Insert novo não gera movimentação de entrada.',
        target_empresa, inserted_count, present_count;
END
$seed$;
