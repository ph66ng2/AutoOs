UPDATE clientes
SET tipo_pessoa = CASE
    WHEN UPPER(BTRIM(COALESCE(tipo_pessoa, ''))) IN ('PF', 'PJ') THEN UPPER(BTRIM(tipo_pessoa))
    WHEN LENGTH(REGEXP_REPLACE(COALESCE(documento, cpf_cnpj, ''), '\D', '', 'g')) = 14 THEN 'PJ'
    ELSE 'PF'
END
WHERE tipo_pessoa IS NULL
   OR BTRIM(tipo_pessoa) = ''
   OR UPPER(BTRIM(tipo_pessoa)) NOT IN ('PF', 'PJ');

UPDATE equipamentos
SET status = CASE BTRIM(COALESCE(status, ''))
    WHEN '' THEN 'RECEBIDO'
    WHEN 'Recebido' THEN 'RECEBIDO'
    WHEN 'RECEBIDO' THEN 'RECEBIDO'
    WHEN 'Em Verificação' THEN 'EM_VERIFICACAO'
    WHEN 'EM_VERIFICACAO' THEN 'EM_VERIFICACAO'
    WHEN 'Verificado' THEN 'VERIFICADO'
    WHEN 'VERIFICADO' THEN 'VERIFICADO'
    WHEN 'Aguardando Aprovação' THEN 'AGUARDANDO_APROVACAO'
    WHEN 'AGUARDANDO_APROVACAO' THEN 'AGUARDANDO_APROVACAO'
    WHEN 'Aprovado' THEN 'APROVADO'
    WHEN 'APROVADO' THEN 'APROVADO'
    WHEN 'Reprovado' THEN 'REPROVADO'
    WHEN 'REPROVADO' THEN 'REPROVADO'
    WHEN 'Em Manutenção' THEN 'EM_MANUTENCAO'
    WHEN 'EM_MANUTENCAO' THEN 'EM_MANUTENCAO'
    WHEN 'Aguardando Peça' THEN 'AGUARDANDO_PECA'
    WHEN 'AGUARDANDO_PECA' THEN 'AGUARDANDO_PECA'
    WHEN 'Pronto' THEN 'PRONTO'
    WHEN 'PRONTO' THEN 'PRONTO'
    WHEN 'Entregue' THEN 'ENTREGUE'
    WHEN 'ENTREGUE' THEN 'ENTREGUE'
    WHEN 'Orçamento Vencido' THEN 'ORCAMENTO_VENCIDO'
    WHEN 'ORCAMENTO_VENCIDO' THEN 'ORCAMENTO_VENCIDO'
    WHEN 'Abandonado' THEN 'ABANDONADO'
    WHEN 'ABANDONADO' THEN 'ABANDONADO'
    ELSE status
END;

UPDATE produtos
SET quantidade_estoque = COALESCE(quantidade_estoque, 0),
    quantidade_minima = COALESCE(quantidade_minima, 5),
    quantidade_maxima = GREATEST(COALESCE(quantidade_maxima, 50), COALESCE(quantidade_minima, 5)),
    unidade_medida = COALESCE(NULLIF(BTRIM(unidade_medida), ''), 'UN')
WHERE quantidade_estoque IS NULL
   OR quantidade_minima IS NULL
   OR quantidade_maxima IS NULL
   OR unidade_medida IS NULL
   OR BTRIM(unidade_medida) = '';

UPDATE security_profiles
SET ativo = COALESCE(ativo, true),
    is_default = COALESCE(is_default, false),
    nome = BTRIM(nome),
    role = BTRIM(role),
    permissions = BTRIM(permissions)
WHERE ativo IS NULL
   OR is_default IS NULL
   OR nome <> BTRIM(nome)
   OR role <> BTRIM(role)
   OR permissions <> BTRIM(permissions);

WITH ranked_defaults AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id ASC) AS row_number
    FROM security_profiles
    WHERE ativo = true AND is_default = true
)
UPDATE security_profiles AS profiles
SET is_default = CASE WHEN ranked_defaults.row_number = 1 THEN true ELSE false END
FROM ranked_defaults
WHERE profiles.id = ranked_defaults.id;

UPDATE security_profiles
SET is_default = true
WHERE id = (
    SELECT id
    FROM security_profiles
    WHERE ativo = true
    ORDER BY id ASC
    LIMIT 1
)
AND NOT EXISTS (
    SELECT 1
    FROM security_profiles
    WHERE ativo = true AND is_default = true
);

UPDATE security_audit_log
SET success = COALESCE(success, true),
    event_type = BTRIM(event_type)
WHERE success IS NULL
   OR event_type <> BTRIM(event_type);

ALTER TABLE clientes
    ALTER COLUMN tipo_pessoa SET DEFAULT 'PF';

ALTER TABLE produtos
    ALTER COLUMN quantidade_estoque SET DEFAULT 0,
    ALTER COLUMN quantidade_minima SET DEFAULT 5,
    ALTER COLUMN quantidade_maxima SET DEFAULT 50,
    ALTER COLUMN unidade_medida SET DEFAULT 'UN';

ALTER TABLE equipamentos
    ALTER COLUMN status SET DEFAULT 'RECEBIDO';

ALTER TABLE security_profiles
    ALTER COLUMN ativo SET DEFAULT true,
    ALTER COLUMN is_default SET DEFAULT false;

ALTER TABLE security_audit_log
    ALTER COLUMN success SET DEFAULT true;

ALTER TABLE clientes
    ADD CONSTRAINT chk_clientes_tipo_pessoa
        CHECK (tipo_pessoa IS NOT NULL AND tipo_pessoa IN ('PF', 'PJ')) NOT VALID,
    ADD CONSTRAINT chk_clientes_uf_len
        CHECK (uf IS NULL OR CHAR_LENGTH(BTRIM(uf)) <= 2) NOT VALID;

ALTER TABLE equipamentos
    ADD CONSTRAINT chk_equipamentos_serial_number_not_blank
        CHECK (BTRIM(serial_number) <> '') NOT VALID,
    ADD CONSTRAINT chk_equipamentos_marca_not_blank
        CHECK (BTRIM(marca) <> '') NOT VALID,
    ADD CONSTRAINT chk_equipamentos_modelo_not_blank
        CHECK (BTRIM(modelo) <> '') NOT VALID,
    ADD CONSTRAINT chk_equipamentos_tipo_not_blank
        CHECK (BTRIM(tipo) <> '') NOT VALID,
    ADD CONSTRAINT chk_equipamentos_status_known
        CHECK (status IS NOT NULL AND status IN (
            'RECEBIDO', 'EM_VERIFICACAO', 'VERIFICADO', 'AGUARDANDO_APROVACAO',
            'APROVADO', 'REPROVADO', 'EM_MANUTENCAO', 'AGUARDANDO_PECA',
            'PRONTO', 'ENTREGUE', 'ORCAMENTO_VENCIDO', 'ABANDONADO'
        )) NOT VALID,
    ADD CONSTRAINT chk_equipamentos_paginas_non_negative
        CHECK (paginas_impressas IS NULL OR paginas_impressas >= 0) NOT VALID,
    ADD CONSTRAINT chk_equipamentos_valores_non_negative
        CHECK (
            (preco_compra IS NULL OR preco_compra >= 0)
            AND (preco_venda IS NULL OR preco_venda >= 0)
            AND (valor_orcamento IS NULL OR valor_orcamento >= 0)
            AND (valor_final IS NULL OR valor_final >= 0)
        ) NOT VALID;

ALTER TABLE produtos
    ADD CONSTRAINT chk_produtos_codigo_not_blank
        CHECK (BTRIM(codigo) <> '') NOT VALID,
    ADD CONSTRAINT chk_produtos_nome_not_blank
        CHECK (BTRIM(nome) <> '') NOT VALID,
    ADD CONSTRAINT chk_produtos_categoria_not_blank
        CHECK (BTRIM(categoria) <> '') NOT VALID,
    ADD CONSTRAINT chk_produtos_quantidades_non_negative
        CHECK (
            COALESCE(quantidade_estoque, 0) >= 0
            AND COALESCE(quantidade_minima, 0) >= 0
            AND COALESCE(quantidade_maxima, 0) >= 0
            AND COALESCE(quantidade_maxima, 0) >= COALESCE(quantidade_minima, 0)
        ) NOT VALID,
    ADD CONSTRAINT chk_produtos_precos_non_negative
        CHECK (
            preco_custo >= 0
            AND preco_venda >= 0
        ) NOT VALID,
    ADD CONSTRAINT chk_produtos_rendimento_non_negative
        CHECK (rendimento IS NULL OR rendimento >= 0) NOT VALID,
    ADD CONSTRAINT chk_produtos_prazo_entrega_non_negative
        CHECK (prazo_entrega IS NULL OR prazo_entrega >= 0) NOT VALID,
    ADD CONSTRAINT chk_produtos_unidade_medida_not_blank
        CHECK (COALESCE(BTRIM(unidade_medida), '') <> '') NOT VALID;

ALTER TABLE movimentacoes_estoque
    ADD CONSTRAINT chk_movimentacoes_tipo
        CHECK (tipo IN ('ENTRADA', 'SAIDA')) NOT VALID,
    ADD CONSTRAINT chk_movimentacoes_quantidade_positive
        CHECK (quantidade > 0) NOT VALID,
    ADD CONSTRAINT chk_movimentacoes_origem_not_blank
        CHECK (BTRIM(origem) <> '') NOT VALID,
    ADD CONSTRAINT chk_movimentacoes_valores_non_negative
        CHECK (
            (valor_unitario IS NULL OR valor_unitario >= 0)
            AND (valor_total IS NULL OR valor_total >= 0)
        ) NOT VALID;

ALTER TABLE verificacoes
    ADD CONSTRAINT chk_verificacoes_tecnico_not_blank
        CHECK (BTRIM(tecnico_nome) <> '') NOT VALID,
    ADD CONSTRAINT chk_verificacoes_problema_not_blank
        CHECK (BTRIM(problema_relatado) <> '') NOT VALID,
    ADD CONSTRAINT chk_verificacoes_valores_non_negative
        CHECK (
            (custo_estimado_mao_obra IS NULL OR custo_estimado_mao_obra >= 0)
            AND (custo_estimado_pecas IS NULL OR custo_estimado_pecas >= 0)
            AND (custo_total IS NULL OR custo_total >= 0)
        ) NOT VALID,
    ADD CONSTRAINT chk_verificacoes_tempo_non_negative
        CHECK (tempo_estimado IS NULL OR tempo_estimado >= 0) NOT VALID;

ALTER TABLE comunicacoes
    ADD CONSTRAINT chk_comunicacoes_tipo_not_blank
        CHECK (BTRIM(tipo) <> '') NOT VALID,
    ADD CONSTRAINT chk_comunicacoes_canal_not_blank
        CHECK (BTRIM(canal) <> '') NOT VALID,
    ADD CONSTRAINT chk_comunicacoes_destinatario_not_blank
        CHECK (BTRIM(destinatario) <> '') NOT VALID,
    ADD CONSTRAINT chk_comunicacoes_contato_not_blank
        CHECK (BTRIM(contato) <> '') NOT VALID,
    ADD CONSTRAINT chk_comunicacoes_mensagem_not_blank
        CHECK (BTRIM(mensagem) <> '') NOT VALID;

ALTER TABLE security_profiles
    ADD CONSTRAINT chk_security_profiles_nome_not_blank
        CHECK (BTRIM(nome) <> '') NOT VALID,
    ADD CONSTRAINT chk_security_profiles_role_not_blank
        CHECK (BTRIM(role) <> '') NOT VALID,
    ADD CONSTRAINT chk_security_profiles_permissions_json
        CHECK (jsonb_typeof(permissions::jsonb) = 'array') NOT VALID;

ALTER TABLE security_audit_log
    ADD CONSTRAINT chk_security_audit_event_type_not_blank
        CHECK (BTRIM(event_type) <> '') NOT VALID;

CREATE INDEX IF NOT EXISTS idx_clientes_ativos_id_desc
    ON clientes (id DESC)
    WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_equipamentos_status_id_desc
    ON equipamentos (status, id DESC);

CREATE INDEX IF NOT EXISTS idx_equipamentos_cliente_id
    ON equipamentos (cliente_id);

CREATE INDEX IF NOT EXISTS idx_produtos_ativos_id_desc
    ON produtos (id DESC)
    WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_produtos_ativos_categoria_id_desc
    ON produtos (categoria, id DESC)
    WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_produtos_estoque_baixo
    ON produtos (id DESC)
    WHERE ativo = true AND quantidade_estoque < quantidade_minima;

CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto_data_hora_desc
    ON movimentacoes_estoque (produto_id, data_hora DESC);

CREATE INDEX IF NOT EXISTS idx_verificacoes_equipamento_data_inicio_desc
    ON verificacoes (equipamento_id, data_inicio DESC);

CREATE INDEX IF NOT EXISTS idx_comunicacoes_equipamento_criado_em_desc
    ON comunicacoes (equipamento_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_security_profiles_ativos_nome
    ON security_profiles (ativo, nome);

CREATE UNIQUE INDEX IF NOT EXISTS ux_security_profiles_single_default_active
    ON security_profiles ((1))
    WHERE ativo = true AND is_default = true;

CREATE INDEX IF NOT EXISTS idx_security_audit_created_at_desc
    ON security_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_profile_created_at_desc
    ON security_audit_log (profile_id, created_at DESC);