-- Migration 0009: Garantias de idempotência para constraints
-- ═══════════════════════════════════════════════════════════════
-- PostgreSQL não suporta ADD CONSTRAINT IF NOT EXISTS nativamente.
-- Esta migration aplica todas as constraints anteriores de forma
-- idempotente, usando DO $$ ... EXCEPTION WHEN duplicate_object $$,
-- para que nunca falhem ao rodar em bancos que já as possuam.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
    -- 0002: clientes
    BEGIN ALTER TABLE clientes ADD CONSTRAINT chk_clientes_tipo_pessoa CHECK (tipo_pessoa IS NOT NULL AND tipo_pessoa IN ('PF', 'PJ')) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE clientes ADD CONSTRAINT chk_clientes_uf_len CHECK (uf IS NULL OR CHAR_LENGTH(BTRIM(uf)) <= 2) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0002: equipamentos
    BEGIN ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_serial_number_not_blank CHECK (BTRIM(serial_number) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_marca_not_blank CHECK (BTRIM(marca) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_modelo_not_blank CHECK (BTRIM(modelo) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_tipo_not_blank CHECK (BTRIM(tipo) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_status_known CHECK (status IS NOT NULL AND status IN ('RECEBIDO', 'EM_VERIFICACAO', 'VERIFICADO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'REPROVADO', 'EM_MANUTENCAO', 'AGUARDANDO_PECA', 'PRONTO', 'ENTREGUE', 'ORCAMENTO_VENCIDO', 'ABANDONADO')) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_paginas_non_negative CHECK (paginas_impressas IS NULL OR paginas_impressas >= 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_valores_non_negative CHECK ((preco_compra IS NULL OR preco_compra >= 0) AND (preco_venda IS NULL OR preco_venda >= 0) AND (valor_orcamento IS NULL OR valor_orcamento >= 0) AND (valor_final IS NULL OR valor_final >= 0)) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0002: produtos
    BEGIN ALTER TABLE produtos ADD CONSTRAINT chk_produtos_codigo_not_blank CHECK (BTRIM(codigo) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE produtos ADD CONSTRAINT chk_produtos_nome_not_blank CHECK (BTRIM(nome) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE produtos ADD CONSTRAINT chk_produtos_categoria_not_blank CHECK (BTRIM(categoria) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE produtos ADD CONSTRAINT chk_produtos_quantidades_non_negative CHECK (COALESCE(quantidade_estoque, 0) >= 0 AND COALESCE(quantidade_minima, 0) >= 0 AND COALESCE(quantidade_maxima, 0) >= 0 AND COALESCE(quantidade_maxima, 0) >= COALESCE(quantidade_minima, 0)) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE produtos ADD CONSTRAINT chk_produtos_precos_non_negative CHECK (preco_custo >= 0 AND preco_venda >= 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE produtos ADD CONSTRAINT chk_produtos_rendimento_non_negative CHECK (rendimento IS NULL OR rendimento >= 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE produtos ADD CONSTRAINT chk_produtos_prazo_entrega_non_negative CHECK (prazo_entrega IS NULL OR prazo_entrega >= 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE produtos ADD CONSTRAINT chk_produtos_unidade_medida_not_blank CHECK (COALESCE(BTRIM(unidade_medida), '') <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0002: movimentacoes_estoque
    BEGIN ALTER TABLE movimentacoes_estoque ADD CONSTRAINT chk_movimentacoes_tipo CHECK (tipo IN ('ENTRADA', 'SAIDA')) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE movimentacoes_estoque ADD CONSTRAINT chk_movimentacoes_quantidade_positive CHECK (quantidade > 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE movimentacoes_estoque ADD CONSTRAINT chk_movimentacoes_origem_not_blank CHECK (BTRIM(origem) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE movimentacoes_estoque ADD CONSTRAINT chk_movimentacoes_valores_non_negative CHECK ((valor_unitario IS NULL OR valor_unitario >= 0) AND (valor_total IS NULL OR valor_total >= 0)) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0002: verificacoes
    BEGIN ALTER TABLE verificacoes ADD CONSTRAINT chk_verificacoes_tecnico_not_blank CHECK (BTRIM(tecnico_nome) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE verificacoes ADD CONSTRAINT chk_verificacoes_problema_not_blank CHECK (BTRIM(problema_relatado) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE verificacoes ADD CONSTRAINT chk_verificacoes_valores_non_negative CHECK ((custo_estimado_mao_obra IS NULL OR custo_estimado_mao_obra >= 0) AND (custo_estimado_pecas IS NULL OR custo_estimado_pecas >= 0) AND (custo_total IS NULL OR custo_total >= 0)) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE verificacoes ADD CONSTRAINT chk_verificacoes_tempo_non_negative CHECK (tempo_estimado IS NULL OR tempo_estimado >= 0) NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0002: comunicacoes
    BEGIN ALTER TABLE comunicacoes ADD CONSTRAINT chk_comunicacoes_tipo_not_blank CHECK (BTRIM(tipo) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE comunicacoes ADD CONSTRAINT chk_comunicacoes_canal_not_blank CHECK (BTRIM(canal) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE comunicacoes ADD CONSTRAINT chk_comunicacoes_destinatario_not_blank CHECK (BTRIM(destinatario) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE comunicacoes ADD CONSTRAINT chk_comunicacoes_contato_not_blank CHECK (BTRIM(contato) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE comunicacoes ADD CONSTRAINT chk_comunicacoes_mensagem_not_blank CHECK (BTRIM(mensagem) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0002: security_profiles
    BEGIN ALTER TABLE security_profiles ADD CONSTRAINT chk_security_profiles_nome_not_blank CHECK (BTRIM(nome) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE security_profiles ADD CONSTRAINT chk_security_profiles_role_not_blank CHECK (BTRIM(role) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE security_profiles ADD CONSTRAINT chk_security_profiles_permissions_json CHECK (jsonb_typeof(permissions::jsonb) = 'array') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0002: security_audit_log
    BEGIN ALTER TABLE security_audit_log ADD CONSTRAINT chk_security_audit_event_type_not_blank CHECK (BTRIM(event_type) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0003: equipamentos
    BEGIN ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_patrimonio_not_blank CHECK (patrimonio IS NULL OR BTRIM(patrimonio) <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_defeito_relatado_not_blank CHECK (COALESCE(BTRIM(defeito_relatado), '') <> '') NOT VALID; EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0004: equipamento_imagens
    BEGIN ALTER TABLE equipamento_imagens ADD CONSTRAINT chk_equipamento_imagens_categoria CHECK (categoria IN ('ENTRADA', 'SAIDA', 'VERIFICACAO')); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamento_imagens ADD CONSTRAINT chk_equipamento_imagens_filename_not_blank CHECK (BTRIM(filename) <> ''); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamento_imagens ADD CONSTRAINT chk_equipamento_imagens_mime_type_allowed CHECK (mime_type IN ('image/jpeg', 'image/png')); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamento_imagens ADD CONSTRAINT chk_equipamento_imagens_tamanho_positivo CHECK (tamanho_bytes > 0); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamento_imagens ADD CONSTRAINT chk_equipamento_imagens_largura_positiva CHECK (largura IS NULL OR largura > 0); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamento_imagens ADD CONSTRAINT chk_equipamento_imagens_altura_positiva CHECK (altura IS NULL OR altura > 0); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE equipamento_imagens ADD CONSTRAINT chk_equipamento_imagens_ordem_valida CHECK (ordem >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0005: servicos_catalogo
    BEGIN ALTER TABLE servicos_catalogo ADD CONSTRAINT chk_servicos_catalogo_nome_not_blank CHECK (BTRIM(nome) <> ''); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE servicos_catalogo ADD CONSTRAINT chk_servicos_catalogo_preco_non_negative CHECK (preco_padrao >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0006: gastos_fixos
    BEGIN ALTER TABLE gastos_fixos ADD CONSTRAINT chk_gastos_fixos_valor_nao_negativo CHECK (valor >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE gastos_fixos ADD CONSTRAINT chk_gastos_fixos_vencimento_dia_valido CHECK (vencimento_dia IS NULL OR (vencimento_dia >= 1 AND vencimento_dia <= 31)); EXCEPTION WHEN duplicate_object THEN NULL; END;

    -- 0006: gastos_variaveis
    BEGIN ALTER TABLE gastos_variaveis ADD CONSTRAINT chk_gastos_variaveis_valor_positivo CHECK (valor > 0); EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TABLE gastos_variaveis ADD CONSTRAINT chk_gastos_variaveis_data_nao_futura CHECK (data <= CURRENT_DATE); EXCEPTION WHEN duplicate_object THEN NULL; END;

END $$;
