-- 0040: orçamento de venda avulsa de insumos (etiquetas, ribbons, peças e outros do estoque),
-- feito para um cliente sem equipamento em manutenção.
--
-- * `orcamentos_insumos`: cabeçalho. O número é sequencial por empresa e aparece como "OI-<n>".
-- * `orcamento_insumos_itens`: itens com nome e categoria copiados do produto no momento do
--   orçamento, para o documento não mudar se o cadastro do produto mudar depois.
-- * `orcamentos_insumos_contadores`: último número usado por empresa (atualizado na mesma
--   transação que cria o orçamento, então não há números repetidos nem saltos por concorrência).
--
-- Aprovar baixa o estoque (movimentacoes_estoque com origem VENDA_INSUMOS e referência OI-<n>).
-- `movimentacoes_estoque.origem` não tem CHECK de valores (só "não vazio", 0002), então a origem
-- nova não precisa de ajuste de constraint.
--
-- O modelo já comporta a resposta pelo portal numa etapa futura (status APROVADO/REPROVADO e
-- `decidido_em`); nenhuma função do portal foi tocada aqui. Sem dados reais.

CREATE TABLE IF NOT EXISTS orcamentos_insumos_contadores (
    empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    ultimo_numero INTEGER NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0)
);

CREATE TABLE IF NOT EXISTS orcamentos_insumos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
    contato_id INTEGER REFERENCES cliente_contatos(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'RASCUNHO',
    validade DATE,
    observacoes TEXT,
    desconto NUMERIC(12, 2) NOT NULL DEFAULT 0,
    valor_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    forma_pagamento_codigo TEXT,
    forma_pagamento_detalhe TEXT,
    criado_por_profile_id INTEGER REFERENCES security_profiles(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    enviado_em TIMESTAMPTZ,
    decidido_em TIMESTAMPTZ,
    entregue_em TIMESTAMPTZ,
    CONSTRAINT uq_orcamentos_insumos_numero UNIQUE (empresa_id, numero),
    CONSTRAINT chk_orcamentos_insumos_numero CHECK (numero > 0),
    CONSTRAINT chk_orcamentos_insumos_status
        CHECK (status IN ('RASCUNHO', 'ENVIADO', 'APROVADO', 'REPROVADO', 'CANCELADO', 'ENTREGUE')),
    CONSTRAINT chk_orcamentos_insumos_desconto CHECK (desconto >= 0),
    CONSTRAINT chk_orcamentos_insumos_valor_total CHECK (valor_total >= 0),
    CONSTRAINT chk_orcamentos_insumos_forma_pagamento_codigo
        CHECK (
            forma_pagamento_codigo IS NULL
            OR forma_pagamento_codigo IN (
                'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO',
                'DINHEIRO', 'TRANSFERENCIA', 'A_COMBINAR', 'OUTRO'
            )
        ),
    CONSTRAINT chk_orcamentos_insumos_forma_pagamento_outro
        CHECK (
            forma_pagamento_codigo IS DISTINCT FROM 'OUTRO'
            OR NULLIF(BTRIM(forma_pagamento_detalhe), '') IS NOT NULL
        ),
    -- Entregue só depois de aprovado; aprovado/entregue sempre têm a forma de pagamento.
    CONSTRAINT chk_orcamentos_insumos_entrega
        CHECK ((status = 'ENTREGUE') = (entregue_em IS NOT NULL)),
    CONSTRAINT chk_orcamentos_insumos_pagamento_aprovado
        CHECK (status NOT IN ('APROVADO', 'ENTREGUE') OR forma_pagamento_codigo IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS orcamento_insumos_itens (
    id SERIAL PRIMARY KEY,
    orcamento_id INTEGER NOT NULL REFERENCES orcamentos_insumos(id) ON DELETE CASCADE,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
    descricao TEXT NOT NULL,
    categoria TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    valor_unitario NUMERIC(12, 2) NOT NULL,
    valor_total NUMERIC(12, 2) NOT NULL,
    CONSTRAINT uq_orcamento_insumos_itens_produto UNIQUE (orcamento_id, produto_id),
    CONSTRAINT chk_orcamento_insumos_itens_descricao CHECK (BTRIM(descricao) <> ''),
    CONSTRAINT chk_orcamento_insumos_itens_quantidade CHECK (quantidade > 0),
    CONSTRAINT chk_orcamento_insumos_itens_valor_unitario CHECK (valor_unitario >= 0),
    CONSTRAINT chk_orcamento_insumos_itens_valor_total
        CHECK (valor_total >= 0 AND valor_total = quantidade * valor_unitario)
);

CREATE INDEX IF NOT EXISTS idx_orcamentos_insumos_empresa_status
    ON orcamentos_insumos (empresa_id, status, id DESC);
CREATE INDEX IF NOT EXISTS idx_orcamentos_insumos_empresa_cliente
    ON orcamentos_insumos (empresa_id, cliente_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_orcamento_insumos_itens_orcamento
    ON orcamento_insumos_itens (orcamento_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_insumos_itens_empresa_produto
    ON orcamento_insumos_itens (empresa_id, produto_id);

-- Tabelas internas do aplicativo: RLS ligado e nenhuma policy, sem acesso para os papéis da API
-- pública. O aplicativo acessa pelo papel dono do banco, sempre filtrando por empresa_id.
ALTER TABLE orcamentos_insumos_contadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos_insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_insumos_itens ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON orcamentos_insumos_contadores, orcamentos_insumos, orcamento_insumos_itens FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON orcamentos_insumos_contadores, orcamentos_insumos, orcamento_insumos_itens FROM authenticated';
    END IF;
END $$;

COMMENT ON TABLE orcamentos_insumos IS
    'Orçamento de venda avulsa de insumos. Número exibido como OI-<numero>; aprovar baixa o estoque (origem VENDA_INSUMOS).';
