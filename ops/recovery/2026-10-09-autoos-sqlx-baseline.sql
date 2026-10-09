-- REGISTRO HISTÓRICO: a reconciliação foi executada em 2026-10-09.
-- A guarda de schema abaixo foi acrescentada após a execução. Não reutilize
-- este arquivo como baseline genérico sem nova auditoria do banco de destino.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';
LOCK TABLE public._sqlx_migrations IN EXCLUSIVE MODE;
DO $$
DECLARE
    missing_tables TEXT;
BEGIN
    SELECT string_agg(name, ', ' ORDER BY name) INTO missing_tables
    FROM unnest(ARRAY[
        'cliente_contatos', 'clientes', 'comunicacoes', 'configuracoes_sistema',
        'empresas', 'equipamento_imagens', 'equipamentos', 'gastos_fixos',
        'gastos_variaveis', 'movimentacoes_estoque', 'orcamento_consumos',
        'orcamento_servicos_decisao', 'produtos', 'security_audit_log',
        'security_profiles', 'servicos_catalogo', 'verificacoes'
    ]) AS required(name)
    WHERE to_regclass(format('public.%I', name)) IS NULL;

    IF missing_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Tabelas do baseline 0001–0023 ausentes: %', missing_tables;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'equipamentos'
          AND column_name = 'responsavel_contato_id'
    ) OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'verificacoes'
          AND column_name = 'forma_pagamento_codigo'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.equipamentos'::regclass
          AND conname = 'fk_equipamentos_responsavel_contato'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'clientes'
          AND indexname = 'ux_clientes_documento_ativo'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = 'clientes'
          AND indexname = 'ux_clientes_cpf_cnpj_ativo'
    ) THEN
        RAISE EXCEPTION 'Schema legado incompleto: efeitos das migrations 0017/0023 ausentes';
    END IF;
END $$;
DO $$ BEGIN IF (SELECT count(*) FROM public._sqlx_migrations) <> 1 OR NOT EXISTS (SELECT 1 FROM public._sqlx_migrations WHERE version=1 AND success AND encode(checksum,'hex')='4b4a2ab3e7c6d70e31352cc836c55d74143c4d01ace8777795108effedf89de951b2a7d5b56b89b6e4a89d1eeabc1afa') THEN RAISE EXCEPTION 'Unexpected SQLx baseline'; END IF; IF (SELECT count(*) FROM public.empresas) <> 1 THEN RAISE EXCEPTION 'Expected exactly one company'; END IF; IF EXISTS (SELECT 1 FROM (SELECT empresa_id, lower(btrim(nome)) FROM public.servicos_catalogo WHERE ativo GROUP BY 1,2 HAVING count(*)>1) duplicate) THEN RAISE EXCEPTION 'Duplicate active service name'; END IF; END $$;
-- Begin 0006_gastos.sql
-- ═══════════════════════════════════════════════════════════════
-- Migration 0006: Gastos Fixos e Variáveis
-- ═══════════════════════════════════════════════════════════════
-- Cria as tabelas de gastos fixos (despesas recorrentes) e
-- gastos variáveis (despesas avulsas/extraordinárias) com
-- relacionamento opcional entre si.
-- ═══════════════════════════════════════════════════════════════

-- ─── Gastos Fixos ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gastos_fixos (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    vencimento_dia INTEGER,
    categoria TEXT NOT NULL,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_gastos_fixos_valor_nao_negativo
        CHECK (valor >= 0),
    CONSTRAINT chk_gastos_fixos_vencimento_dia_valido
        CHECK (vencimento_dia IS NULL OR (vencimento_dia >= 1 AND vencimento_dia <= 31))
);

-- ─── Gastos Variáveis ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS gastos_variaveis (
    id SERIAL PRIMARY KEY,
    descricao TEXT NOT NULL,
    valor NUMERIC(15,2) NOT NULL,
    data DATE NOT NULL,
    categoria TEXT NOT NULL,
    nota TEXT,
    referencia_id INTEGER,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gastos_variaveis_referencia
        FOREIGN KEY (referencia_id) REFERENCES gastos_fixos(id) ON DELETE SET NULL,
    CONSTRAINT chk_gastos_variaveis_valor_positivo
        CHECK (valor > 0),
    CONSTRAINT chk_gastos_variaveis_data_nao_futura
        CHECK (data <= CURRENT_DATE)
);

-- ─── Índices ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_gastos_variaveis_data
    ON gastos_variaveis (data);

CREATE INDEX IF NOT EXISTS idx_gastos_variaveis_categoria_data
    ON gastos_variaveis (categoria, data);

-- ─── Seed: Categorias de Gastos Fixos (referência) ─────────
-- Categorias padrão como linhas de gastos_fixos inativos com
-- valor zero, servindo como referência para o campo categoria
-- em ambas as tabelas.

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Aluguel', 0, NULL, 'Aluguel', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Aluguel');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Energia', 0, NULL, 'Energia', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Energia');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Internet', 0, NULL, 'Internet', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Internet');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Fornecedores', 0, NULL, 'Fornecedores', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Fornecedores');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Folha', 0, NULL, 'Folha', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Folha');

INSERT INTO gastos_fixos (nome, valor, vencimento_dia, categoria, ativo)
SELECT 'Outros', 0, NULL, 'Outros', false
WHERE NOT EXISTS (SELECT 1 FROM gastos_fixos WHERE nome = 'Outros');

-- End 0006_gastos.sql
-- Begin 0016_backfill_orcamento_equipamentos.sql
-- Migration 0016: sincroniza orçamentos antigos gravados apenas na verificação.
-- O valor principal do equipamento é usado na listagem, aprovações e PDFs.
-- Não sobrescreve valores já definidos manualmente no equipamento.

UPDATE equipamentos AS e
SET valor_orcamento = latest.custo_total
FROM (
    SELECT DISTINCT ON (equipamento_id)
        equipamento_id,
        custo_total
    FROM verificacoes
    WHERE custo_total IS NOT NULL
      AND custo_total > 0
    ORDER BY equipamento_id, id DESC
) AS latest
WHERE e.id = latest.equipamento_id
  AND e.valor_orcamento IS NULL;

-- End 0016_backfill_orcamento_equipamentos.sql
-- Begin 0018_patrimonio_por_serial.sql
-- Permite que ciclos de manutenção do mesmo equipamento reutilizem o patrimônio.
--
-- O índice único da migration 0003 impedia qualquer repetição de patrimônio,
-- inclusive quando a série era a mesma. Um índice composto não resolveria o
-- caso de negócio: ele também permitiria o mesmo patrimônio em séries
-- diferentes. A trigger abaixo mantém a relação patrimônio -> série e permite
-- somente repetições dentro da mesma série.

DROP INDEX IF EXISTS ux_equipamentos_patrimonio_when_present;

CREATE OR REPLACE FUNCTION autoos_validar_patrimonio_por_serie()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    patrimonio_normalizado TEXT;
    serie_normalizada TEXT;
BEGIN
    patrimonio_normalizado := NULLIF(LOWER(BTRIM(NEW.patrimonio)), '');
    IF patrimonio_normalizado IS NULL THEN
        RETURN NEW;
    END IF;

    serie_normalizada := LOWER(BTRIM(NEW.serial_number));

    -- Serializa gravações concorrentes do mesmo patrimônio. Sem esse lock,
    -- duas transações poderiam consultar antes de qualquer uma enxergar o
    -- INSERT da outra e ambas poderiam associar séries diferentes.
    PERFORM pg_advisory_xact_lock(hashtextextended(patrimonio_normalizado, 0));

    IF EXISTS (
        SELECT 1
        FROM equipamentos AS existente
        WHERE existente.id <> COALESCE(NEW.id, -1)
          AND NULLIF(LOWER(BTRIM(existente.patrimonio)), '') = patrimonio_normalizado
          AND LOWER(BTRIM(existente.serial_number)) <> serie_normalizada
    ) THEN
        RAISE EXCEPTION 'AUTOOS_PATRIMONIO_SERIAL_CONFLICT: patrimônio já associado a outro número de série'
            USING ERRCODE = '23505',
                  CONSTRAINT = 'ux_equipamentos_patrimonio_when_present';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_equipamentos_patrimonio_por_serie ON equipamentos;

CREATE TRIGGER trg_equipamentos_patrimonio_por_serie
    BEFORE INSERT OR UPDATE OF serial_number, patrimonio ON equipamentos
    FOR EACH ROW
    EXECUTE FUNCTION autoos_validar_patrimonio_por_serie();

-- End 0018_patrimonio_por_serial.sql
-- Begin 0019_reject_new_tenantless_records.sql
-- Impede novos registros sem tenant sem reescrever os legados do 0.5.0.
-- NOT VALID preserva as linhas históricas existentes; PostgreSQL ainda aplica
-- a regra a todo INSERT e UPDATE posterior.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_clientes_empresa_required_new'
          AND conrelid = 'clientes'::regclass
    ) THEN
        ALTER TABLE clientes
            ADD CONSTRAINT chk_clientes_empresa_required_new
            CHECK (empresa_id IS NOT NULL) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_equipamentos_empresa_required_new'
          AND conrelid = 'equipamentos'::regclass
    ) THEN
        ALTER TABLE equipamentos
            ADD CONSTRAINT chk_equipamentos_empresa_required_new
            CHECK (empresa_id IS NOT NULL) NOT VALID;
    END IF;
END $$;

-- End 0019_reject_new_tenantless_records.sql
UPDATE public.movimentacoes_estoque m SET empresa_id = p.empresa_id FROM public.produtos p WHERE p.id = m.produto_id AND m.empresa_id IS NULL AND p.empresa_id IS NOT NULL;
-- Begin 0022_catalogo_servicos_por_empresa.sql
-- Cada empresa passa a ter cópias próprias do catálogo legado. Ligações de
-- peças só são preservadas quando todos os produtos pertencem à cópia destino.
DROP INDEX IF EXISTS ux_servicos_catalogo_nome_ativo;

DO $$
DECLARE
    empresa RECORD;
BEGIN
    FOR empresa IN SELECT id FROM empresas ORDER BY id LOOP
        INSERT INTO servicos_catalogo (
            empresa_id,
            nome,
            descricao,
            preco_padrao,
            pecas_sugeridas,
            ativo,
            criado_em,
            atualizado_em
        )
        SELECT
            empresa.id,
            legado.nome,
            legado.descricao,
            legado.preco_padrao,
            CASE
                WHEN jsonb_typeof(legado.pecas_sugeridas) = 'array'
                 AND NOT EXISTS (
                    SELECT 1
                    FROM jsonb_array_elements(legado.pecas_sugeridas) AS item(value)
                    LEFT JOIN produtos produto
                      ON produto.id::TEXT = (item.value ->> 'produto_id')
                    WHERE produto.id IS NULL
                       OR produto.empresa_id IS DISTINCT FROM empresa.id
                       OR produto.ativo IS DISTINCT FROM true
                 )
                THEN legado.pecas_sugeridas
                ELSE '[]'::jsonb
            END,
            legado.ativo,
            legado.criado_em,
            legado.atualizado_em
        FROM servicos_catalogo legado
        WHERE legado.empresa_id IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM servicos_catalogo existente
              WHERE existente.empresa_id = empresa.id
                AND existente.ativo IS NOT DISTINCT FROM legado.ativo
                AND LOWER(BTRIM(existente.nome)) = LOWER(BTRIM(legado.nome))
          )
        ON CONFLICT DO NOTHING;
    END LOOP;

    -- Com empresas cadastradas, as linhas globais viram cópias independentes.
    IF EXISTS (SELECT 1 FROM empresas) THEN
        DELETE FROM servicos_catalogo WHERE empresa_id IS NULL;
    END IF;
END $$;

CREATE UNIQUE INDEX ux_servicos_catalogo_nome_ativo
    ON servicos_catalogo (empresa_id, LOWER(BTRIM(nome)))
    WHERE ativo = true;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_servicos_catalogo_empresa_required_new'
          AND conrelid = 'servicos_catalogo'::regclass
    ) THEN
        -- Preserva possíveis legados se o banco ainda não tiver empresas.
        ALTER TABLE servicos_catalogo
            ADD CONSTRAINT chk_servicos_catalogo_empresa_required_new
            CHECK (empresa_id IS NOT NULL) NOT VALID;
    END IF;
END $$;

DROP POLICY IF EXISTS "servicos_isolamento" ON servicos_catalogo;
CREATE POLICY "servicos_isolamento" ON servicos_catalogo
    FOR ALL
    USING (empresa_id = current_setting('app.empresa_id', true)::INTEGER)
    WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::INTEGER);

-- End 0022_catalogo_servicos_por_empresa.sql
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.servicos_catalogo WHERE empresa_id IS NULL) THEN RAISE EXCEPTION 'Global services remain'; END IF; IF EXISTS (SELECT 1 FROM public.movimentacoes_estoque m JOIN public.produtos p ON p.id=m.produto_id WHERE m.empresa_id IS NULL AND p.empresa_id IS NOT NULL) THEN RAISE EXCEPTION 'Movement tenant missing'; END IF; IF (SELECT count(*) FROM public.gastos_fixos WHERE nome IN ('Aluguel','Energia','Internet','Fornecedores','Folha','Outros')) <> 6 THEN RAISE EXCEPTION 'Expense references missing'; END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_servicos_catalogo_empresa_required_new') OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_equipamentos_patrimonio_por_serie') THEN RAISE EXCEPTION 'Schema repair incomplete'; END IF; END $$;
UPDATE public._sqlx_migrations SET checksum=decode('2a341f05c643ff924cd0ef76fcca65da04f1d4f3abfa0986fb74a6509fe280098dce8b53bb9b590e29844614985c4316','hex') WHERE version=1;
INSERT INTO public._sqlx_migrations(version,description,success,checksum,execution_time) VALUES (2,'schema hardening',true,decode('fc37b412e7d83ed57ac301fb8f306458d16ec79af779db40e31e1b713cdf823a1a91538cc109d1c3c61ae825af665775','hex'),0),
(3,'equipment intake fields',true,decode('d7e1633091f03e2a42b67bb1f051ec4a8b36a8d591fb5e6bc5b1060a398f7de37ede8d7d238217e3f3a2831de8dca397','hex'),0),
(4,'equipment images',true,decode('a01c52e65ba3a0c8e43bb3071289c896568d689a38003d74531b6ff7a6b3ed2350e382aeef4ee7459b6e077137505842','hex'),0),
(5,'service catalog',true,decode('d5ea5605a4df3ca12712e49941d7c55f84b4eeb8f56d437c48a37cf19117c9e5720dee257c7271a2b17669d9b80693fe','hex'),0),
(6,'gastos',true,decode('ddb2a45db651cb7630f2be6fd19aad1b5110073074fa06f0fcef309fc89952902a8a5af3ad12eaa4300e8d9ffb3f92b9','hex'),0),
(7,'verificacao imagens',true,decode('f858ad349da155e9297fdeea20647f8908b212ebc50d83efcf5d5015b567ea1094a005460e04edc5b44b6f445719a1ff','hex'),0),
(8,'multiplas manutencoes',true,decode('027aa4997b6b73e97ab9463a87b6932cd955c59fd5d251e4b8899caf12d29d9824ae43bc09391b53ccc5b2734285b0f9','hex'),0),
(9,'idempotencia final',true,decode('fed3508fec9297c289b0514fdd64150f6f36a8fd9ee676e3b0af9185d41f9cba9e8e8995af07824541be0313176eee32','hex'),0),
(10,'melhorias autoos',true,decode('db05d111b714cb564ec5be055f53ffd325ab6a35a00c399882ce7a388f983aa3d5b11f93b1e810ec3ff4dd4aaba263b3','hex'),0),
(11,'telefone opcional',true,decode('ca0e5d01a3605e97d576b0309ba2bcabf41950b6a124fdf5ae66ce75b90265b3e0fdfba87164021192dda751ec8bcaa2','hex'),0),
(12,'add storage path',true,decode('af9dd9aabd1b9b17a03ba641409aa156769ecd12b62670f68c570c9034d4cbb5e0d0773dca41a22943a3cbcda2852818','hex'),0),
(13,'drop bytea',true,decode('29af69a6aa9d59af6421d7d43c13b3d6d71ec443a5f86a55432db54d9ae6d69ff1c4665fa55b020f269950a8b675ee5b','hex'),0),
(14,'multi tenant',true,decode('0d00a3a942782d4fa4a26943bf9e38e5e0f353c251fe0a22cc552d22635d7d75eedc816ed9d978960a08ad04c2ad12f2','hex'),0),
(15,'central company credentials',true,decode('0b5b7e1212930aa0254c3387d49d606c76675084c3db8dbb2c8a5fe3ee45aa1f56618ee6b2a89b737c9c873d89217d47','hex'),0),
(16,'backfill orcamento equipamentos',true,decode('87888d9623a00010b43945fc5ab455aa670dc89b4dd4a7a1edf92f75bc448b2e822a3b5e12794b0dca1e59718eed8c3b','hex'),0),
(17,'contatos pagamento orcamento',true,decode('7a440983ba3c5812baf7d9986b5d0cbc94e2976bb16152ef5dc1828ed58259ba4d8b182dbf213921c392a9e27dfafcd2','hex'),0),
(18,'patrimonio por serial',true,decode('cb370a5e6611efecd959710c60bf25c49b31b170ec928e8d1d82452a115b45fbd66bfc18393439049088a05138a329c6','hex'),0),
(19,'reject new tenantless records',true,decode('4f49b4feb862793c8bef4ca08c8b5cce1888f4efbb0df167ba5c3453a4c206b4f4ffa959e9a3d947c1eb040cf5a4e6c9','hex'),0),
(20,'seed estoque produtos',true,decode('1366db05d00297541c47d32f3378d0961389af0bef298f0cbbc8e3a90053a8b7ffd49ed3010a96993e79443fbf37d947','hex'),0),
(21,'orcamento estoque',true,decode('edfbe6f05d93b0de8f144fe6a34468b95637c05b860a838cf323717ea2cfad96bbea8696535117c0bb19f3c3d076ac51','hex'),0),
(22,'catalogo servicos por empresa',true,decode('eba253d9dd6cedd3b7e2bab62b13173ef00a6d652f2bd7cadf6a1c9c01c12f9991261c3c6d25c57e4eee9c2fa5c2118d','hex'),0),
(23,'clientes documento unico ativo',true,decode('fe5ddecba615f65548ea499039d1a9d2ad8970da83a75cf962723309707129d3e262d65c4455be8c5595fc932b3378b7','hex'),0);
DO $$ BEGIN IF (SELECT count(*) FROM public._sqlx_migrations WHERE success) <> 23 THEN RAISE EXCEPTION 'SQLx ledger incomplete'; END IF; END $$;
COMMIT;
