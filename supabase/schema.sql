-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase/schema.sql — Schema AutoOS para Supabase (PostgreSQL 15+)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Fonte de verdade: src-tauri/migrations/0001_initial_schema.sql … 0011_telefone_opcional.sql
-- Adaptações para Supabase:
--   • Todos os PKs são uuid (gen_random_uuid) exceto configuracoes_sistema (UUID fixo)
--   • empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' em TODAS as tabelas
--   • Todas as FKs de INTEGER → uuid REFERENCES
--   • equipamento_imagens: bytes BYTEA → storage_path TEXT
--   • CHECK constraints preservados (NOT VALID)
--   • Índices preservados (parciais, únicos)
--   • 3 tabelas novas: empresas, enrollment_codes, os_status_publico
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Extensão necessária para gen_random_uuid() ────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. empresas (nova)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS empresas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    cnpj TEXT,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_empresas_nome_not_blank CHECK (BTRIM(nome) <> '') NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. clientes
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS clientes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    nome TEXT,
    tipo_pessoa TEXT DEFAULT 'PF',
    documento TEXT UNIQUE,
    razao_social TEXT,
    nome_fantasia TEXT,
    inscricao_estadual TEXT,
    cpf_cnpj TEXT UNIQUE,
    telefone TEXT,
    telefone_secundario TEXT,
    email TEXT,
    cep TEXT,
    endereco TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    cidade TEXT,
    uf TEXT,
    receber_email BOOLEAN DEFAULT true,
    receber_whatsapp BOOLEAN DEFAULT true,
    observacoes TEXT,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_clientes_tipo_pessoa
        CHECK (tipo_pessoa IS NOT NULL AND tipo_pessoa IN ('PF', 'PJ')) NOT VALID,
    CONSTRAINT chk_clientes_uf_len
        CHECK (uf IS NULL OR CHAR_LENGTH(BTRIM(uf)) <= 2) NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. equipamentos
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS equipamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    serial_number TEXT NOT NULL,
    patrimonio TEXT,
    marca TEXT NOT NULL,
    modelo TEXT NOT NULL,
    tipo TEXT NOT NULL,
    status TEXT DEFAULT 'RECEBIDO',
    paginas_impressas INTEGER,
    tecnologia TEXT,
    conectividade TEXT,
    data_entrada TEXT NOT NULL,
    proprietario TEXT,
    preco_compra NUMERIC,
    preco_venda NUMERIC,
    observacoes TEXT,
    cliente_id uuid,
    cliente_nome TEXT,
    cliente_telefone TEXT,
    cliente_email TEXT,
    prazo_aprovacao TEXT,
    data_aprovacao TEXT,
    data_reprovacao TEXT,
    data_verificacao TEXT,
    data_pronto TEXT,
    data_saida TEXT,
    valor_orcamento NUMERIC,
    valor_final NUMERIC,
    defeito_relatado TEXT,
    acessorios TEXT,
    acessorios_outros TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_equipamentos_cliente
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL,
    CONSTRAINT chk_equipamentos_serial_number_not_blank
        CHECK (BTRIM(serial_number) <> '') NOT VALID,
    CONSTRAINT chk_equipamentos_marca_not_blank
        CHECK (BTRIM(marca) <> '') NOT VALID,
    CONSTRAINT chk_equipamentos_modelo_not_blank
        CHECK (BTRIM(modelo) <> '') NOT VALID,
    CONSTRAINT chk_equipamentos_tipo_not_blank
        CHECK (BTRIM(tipo) <> '') NOT VALID,
    CONSTRAINT chk_equipamentos_status_known
        CHECK (status IS NOT NULL AND status IN (
            'RECEBIDO', 'EM_VERIFICACAO', 'VERIFICADO', 'AGUARDANDO_APROVACAO',
            'APROVADO', 'REPROVADO', 'EM_MANUTENCAO', 'AGUARDANDO_PECA',
            'PRONTO', 'ENTREGUE', 'ORCAMENTO_VENCIDO', 'ABANDONADO'
        )) NOT VALID,
    CONSTRAINT chk_equipamentos_paginas_non_negative
        CHECK (paginas_impressas IS NULL OR paginas_impressas >= 0) NOT VALID,
    CONSTRAINT chk_equipamentos_valores_non_negative
        CHECK (
            (preco_compra IS NULL OR preco_compra >= 0)
            AND (preco_venda IS NULL OR preco_venda >= 0)
            AND (valor_orcamento IS NULL OR valor_orcamento >= 0)
            AND (valor_final IS NULL OR valor_final >= 0)
        ) NOT VALID,
    CONSTRAINT chk_equipamentos_patrimonio_not_blank
        CHECK (patrimonio IS NULL OR BTRIM(patrimonio) <> '') NOT VALID,
    CONSTRAINT chk_equipamentos_defeito_relatado_not_blank
        CHECK (COALESCE(BTRIM(defeito_relatado), '') <> '') NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. produtos
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS produtos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    codigo TEXT NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT NOT NULL,
    quantidade_estoque INTEGER DEFAULT 0,
    quantidade_minima INTEGER DEFAULT 5,
    quantidade_maxima INTEGER DEFAULT 50,
    unidade_medida TEXT DEFAULT 'UN',
    localizacao TEXT,
    preco_custo NUMERIC NOT NULL,
    preco_venda NUMERIC NOT NULL,
    margem_lucro NUMERIC,
    marca_original TEXT,
    tipo_cartucho TEXT,
    cor TEXT,
    rendimento INTEGER,
    modelos_compativeis TEXT,
    fornecedor_principal TEXT,
    prazo_entrega INTEGER,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_produtos_codigo_not_blank
        CHECK (BTRIM(codigo) <> '') NOT VALID,
    CONSTRAINT chk_produtos_nome_not_blank
        CHECK (BTRIM(nome) <> '') NOT VALID,
    CONSTRAINT chk_produtos_categoria_not_blank
        CHECK (BTRIM(categoria) <> '') NOT VALID,
    CONSTRAINT chk_produtos_quantidades_non_negative
        CHECK (
            COALESCE(quantidade_estoque, 0) >= 0
            AND COALESCE(quantidade_minima, 0) >= 0
            AND COALESCE(quantidade_maxima, 0) >= 0
            AND COALESCE(quantidade_maxima, 0) >= COALESCE(quantidade_minima, 0)
        ) NOT VALID,
    CONSTRAINT chk_produtos_precos_non_negative
        CHECK (preco_custo >= 0 AND preco_venda >= 0) NOT VALID,
    CONSTRAINT chk_produtos_rendimento_non_negative
        CHECK (rendimento IS NULL OR rendimento >= 0) NOT VALID,
    CONSTRAINT chk_produtos_prazo_entrega_non_negative
        CHECK (prazo_entrega IS NULL OR prazo_entrega >= 0) NOT VALID,
    CONSTRAINT chk_produtos_unidade_medida_not_blank
        CHECK (COALESCE(BTRIM(unidade_medida), '') <> '') NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. movimentacoes_estoque
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    produto_id uuid NOT NULL,
    tipo TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    origem TEXT NOT NULL,
    referencia TEXT,
    data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    usuario TEXT,
    observacoes TEXT,
    valor_unitario NUMERIC,
    valor_total NUMERIC,
    CONSTRAINT fk_movimentacoes_produto
        FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
    CONSTRAINT chk_movimentacoes_tipo
        CHECK (tipo IN ('ENTRADA', 'SAIDA')) NOT VALID,
    CONSTRAINT chk_movimentacoes_quantidade_positive
        CHECK (quantidade > 0) NOT VALID,
    CONSTRAINT chk_movimentacoes_origem_not_blank
        CHECK (BTRIM(origem) <> '') NOT VALID,
    CONSTRAINT chk_movimentacoes_valores_non_negative
        CHECK (
            (valor_unitario IS NULL OR valor_unitario >= 0)
            AND (valor_total IS NULL OR valor_total >= 0)
        ) NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. security_profiles
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS security_profiles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    nome TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    permissions TEXT NOT NULL,
    ativo BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_security_profiles_nome_not_blank
        CHECK (BTRIM(nome) <> '') NOT VALID,
    CONSTRAINT chk_security_profiles_role_not_blank
        CHECK (BTRIM(role) <> '') NOT VALID,
    CONSTRAINT chk_security_profiles_permissions_json
        CHECK (jsonb_typeof(permissions::jsonb) = 'array') NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. verificacoes
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS verificacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    equipamento_id uuid NOT NULL,
    tecnico_nome TEXT NOT NULL,
    data_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_fim TIMESTAMP,
    problema_relatado TEXT NOT NULL,
    diagnostico TEXT,
    itens_verificados TEXT,
    servicos_necessarios TEXT,
    pecas_necessarias TEXT,
    custo_estimado_mao_obra NUMERIC,
    custo_estimado_pecas NUMERIC,
    custo_total NUMERIC,
    tempo_estimado INTEGER,
    concluida BOOLEAN DEFAULT false,
    observacoes TEXT,
    adjusted_at TIMESTAMP,
    adjusted_by_profile_id uuid,
    CONSTRAINT fk_verificacoes_equipamento
        FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE,
    CONSTRAINT fk_verificacoes_adjusted_by_profile
        FOREIGN KEY (adjusted_by_profile_id) REFERENCES security_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_verificacoes_tecnico_not_blank
        CHECK (BTRIM(tecnico_nome) <> '') NOT VALID,
    CONSTRAINT chk_verificacoes_problema_not_blank
        CHECK (BTRIM(problema_relatado) <> '') NOT VALID,
    CONSTRAINT chk_verificacoes_valores_non_negative
        CHECK (
            (custo_estimado_mao_obra IS NULL OR custo_estimado_mao_obra >= 0)
            AND (custo_estimado_pecas IS NULL OR custo_estimado_pecas >= 0)
            AND (custo_total IS NULL OR custo_total >= 0)
        ) NOT VALID,
    CONSTRAINT chk_verificacoes_tempo_non_negative
        CHECK (tempo_estimado IS NULL OR tempo_estimado >= 0) NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. comunicacoes
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comunicacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    equipamento_id uuid NOT NULL,
    tipo TEXT NOT NULL,
    canal TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    contato TEXT NOT NULL,
    assunto TEXT,
    mensagem TEXT NOT NULL,
    anexos TEXT,
    enviado BOOLEAN DEFAULT false,
    data_envio TIMESTAMP,
    erro TEXT,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_comunicacoes_equipamento
        FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE,
    CONSTRAINT chk_comunicacoes_tipo_not_blank
        CHECK (BTRIM(tipo) <> '') NOT VALID,
    CONSTRAINT chk_comunicacoes_canal_not_blank
        CHECK (BTRIM(canal) <> '') NOT VALID,
    CONSTRAINT chk_comunicacoes_destinatario_not_blank
        CHECK (BTRIM(destinatario) <> '') NOT VALID,
    CONSTRAINT chk_comunicacoes_contato_not_blank
        CHECK (BTRIM(contato) <> '') NOT VALID,
    CONSTRAINT chk_comunicacoes_mensagem_not_blank
        CHECK (BTRIM(mensagem) <> '') NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. security_audit_log
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS security_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    event_type TEXT NOT NULL,
    profile_id uuid,
    profile_name TEXT,
    details TEXT,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_profile
        FOREIGN KEY (profile_id) REFERENCES security_profiles(id) ON DELETE SET NULL,
    CONSTRAINT chk_security_audit_event_type_not_blank
        CHECK (BTRIM(event_type) <> '') NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. equipamento_imagens
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS equipamento_imagens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    equipamento_id uuid NOT NULL,
    categoria TEXT NOT NULL DEFAULT 'ENTRADA',
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    tamanho_bytes INTEGER NOT NULL,
    largura INTEGER,
    altura INTEGER,
    ordem INTEGER NOT NULL DEFAULT 0,
    observacao TEXT,
    storage_path TEXT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_equipamento_imagens_equipamento
        FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE,
    CONSTRAINT chk_equipamento_imagens_categoria
        CHECK (categoria IN ('ENTRADA', 'SAIDA', 'VERIFICACAO')) NOT VALID,
    CONSTRAINT chk_equipamento_imagens_filename_not_blank
        CHECK (BTRIM(filename) <> '') NOT VALID,
    CONSTRAINT chk_equipamento_imagens_mime_type_allowed
        CHECK (mime_type IN ('image/jpeg', 'image/png')) NOT VALID,
    CONSTRAINT chk_equipamento_imagens_tamanho_positivo
        CHECK (tamanho_bytes > 0) NOT VALID,
    CONSTRAINT chk_equipamento_imagens_largura_positiva
        CHECK (largura IS NULL OR largura > 0) NOT VALID,
    CONSTRAINT chk_equipamento_imagens_altura_positiva
        CHECK (altura IS NULL OR altura > 0) NOT VALID,
    CONSTRAINT chk_equipamento_imagens_ordem_valida
        CHECK (ordem >= 0) NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. servicos_catalogo
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS servicos_catalogo (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    nome TEXT NOT NULL,
    descricao TEXT,
    preco_padrao NUMERIC NOT NULL,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_servicos_catalogo_nome_not_blank
        CHECK (BTRIM(nome) <> '') NOT VALID,
    CONSTRAINT chk_servicos_catalogo_preco_non_negative
        CHECK (preco_padrao >= 0) NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. gastos_fixos
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gastos_fixos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    nome TEXT NOT NULL,
    valor NUMERIC(15,2) NOT NULL DEFAULT 0,
    vencimento_dia INTEGER,
    categoria TEXT NOT NULL,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_gastos_fixos_valor_nao_negativo
        CHECK (valor >= 0) NOT VALID,
    CONSTRAINT chk_gastos_fixos_vencimento_dia_valido
        CHECK (vencimento_dia IS NULL OR (vencimento_dia >= 1 AND vencimento_dia <= 31)) NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 13. gastos_variaveis
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gastos_variaveis (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    descricao TEXT NOT NULL,
    valor NUMERIC(15,2) NOT NULL,
    data DATE NOT NULL,
    categoria TEXT NOT NULL,
    nota TEXT,
    referencia_id uuid,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_gastos_variaveis_referencia
        FOREIGN KEY (referencia_id) REFERENCES gastos_fixos(id) ON DELETE SET NULL,
    CONSTRAINT chk_gastos_variaveis_valor_positivo
        CHECK (valor > 0) NOT VALID,
    CONSTRAINT chk_gastos_variaveis_data_nao_futura
        CHECK (data <= CURRENT_DATE) NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 14. configuracoes_sistema (singleton — UUID fixo)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
    id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000002'::uuid
        CHECK (id = '00000000-0000-0000-0000-000000000002'::uuid),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    inactivity_lock_enabled BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 15. enrollment_codes (nova)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS enrollment_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
    code_hash TEXT NOT NULL,
    used BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP,
    CONSTRAINT fk_enrollment_codes_empresa
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 16. os_status_publico (nova)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS os_status_publico (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
    equipamento uuid NOT NULL,
    status TEXT NOT NULL,
    token TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_os_status_publico_empresa
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_os_status_publico_equipamento
        FOREIGN KEY (equipamento) REFERENCES equipamentos(id) ON DELETE CASCADE
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 17. photo_upload_sessions e photo_upload_session_items (staging privado)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS photo_upload_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
    profile_id uuid NOT NULL REFERENCES security_profiles(id) ON DELETE RESTRICT,
    equipamento_id uuid REFERENCES equipamentos(id) ON DELETE CASCADE,
    categoria TEXT NOT NULL DEFAULT 'ENTRADA',
    token_hash CHAR(64) NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMP NOT NULL,
    cancelled_at TIMESTAMP,
    consumed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_photo_upload_sessions_categoria
        CHECK (categoria IN ('ENTRADA', 'SAIDA', 'VERIFICACAO')) NOT VALID,
    CONSTRAINT chk_photo_upload_sessions_status
        CHECK (status IN ('PENDING', 'CANCELLED', 'EXPIRED', 'CONSUMED')) NOT VALID,
    CONSTRAINT chk_photo_upload_sessions_token_hash
        CHECK (token_hash ~ '^[0-9a-f]{64}$') NOT VALID,
    CONSTRAINT chk_photo_upload_sessions_expiry
        CHECK (expires_at > created_at) NOT VALID
);

CREATE TABLE IF NOT EXISTS photo_upload_session_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES photo_upload_sessions(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL,
    storage_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    tamanho_bytes INTEGER,
    status TEXT NOT NULL DEFAULT 'UPLOADED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_photo_upload_session_items_position UNIQUE (session_id, position),
    CONSTRAINT chk_photo_upload_session_items_position CHECK (position BETWEEN 0 AND 5) NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_filename CHECK (BTRIM(filename) <> '') NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_storage_path CHECK (BTRIM(storage_path) <> '') NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_storage_object_path
        CHECK (BTRIM(storage_path) !~* '^data:') NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_mime_type
        CHECK (mime_type IN ('image/jpeg', 'image/png')) NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_size CHECK (tamanho_bytes IS NULL OR tamanho_bytes > 0) NOT VALID,
    CONSTRAINT chk_photo_upload_session_items_status
        CHECK (status IN ('UPLOADED', 'REJECTED', 'CONSUMED')) NOT VALID
);

ALTER TABLE photo_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_upload_session_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE photo_upload_sessions, photo_upload_session_items FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════════

-- clientes
CREATE INDEX IF NOT EXISTS idx_clientes_ativos_id_desc
    ON clientes (id DESC)
    WHERE ativo = true;

-- equipamentos
CREATE INDEX IF NOT EXISTS idx_equipamentos_status_id_desc
    ON equipamentos (status, id DESC);

CREATE INDEX IF NOT EXISTS idx_equipamentos_cliente_id
    ON equipamentos (cliente_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_equipamentos_patrimonio_when_present
    ON equipamentos ((LOWER(BTRIM(patrimonio))))
    WHERE NULLIF(BTRIM(patrimonio), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_equipamentos_patrimonio
    ON equipamentos (patrimonio)
    WHERE NULLIF(BTRIM(patrimonio), '') IS NOT NULL;

-- produtos
CREATE INDEX IF NOT EXISTS idx_produtos_ativos_id_desc
    ON produtos (id DESC)
    WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_produtos_ativos_categoria_id_desc
    ON produtos (categoria, id DESC)
    WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_produtos_estoque_baixo
    ON produtos (id DESC)
    WHERE ativo = true AND quantidade_estoque < quantidade_minima;

-- movimentacoes_estoque
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto_data_hora_desc
    ON movimentacoes_estoque (produto_id, data_hora DESC);

-- verificacoes
CREATE INDEX IF NOT EXISTS idx_verificacoes_equipamento_data_inicio_desc
    ON verificacoes (equipamento_id, data_inicio DESC);

-- comunicacoes
CREATE INDEX IF NOT EXISTS idx_comunicacoes_equipamento_criado_em_desc
    ON comunicacoes (equipamento_id, criado_em DESC);

-- security_profiles
CREATE INDEX IF NOT EXISTS idx_security_profiles_ativos_nome
    ON security_profiles (ativo, nome);

CREATE UNIQUE INDEX IF NOT EXISTS ux_security_profiles_single_default_active
    ON security_profiles ((1))
    WHERE ativo = true AND is_default = true;

-- security_audit_log
CREATE INDEX IF NOT EXISTS idx_security_audit_created_at_desc
    ON security_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_profile_created_at_desc
    ON security_audit_log (profile_id, created_at DESC);

-- equipamento_imagens
CREATE INDEX IF NOT EXISTS idx_equipamento_imagens_equipamento
    ON equipamento_imagens (equipamento_id, categoria, ordem, id);

-- photo_upload_sessions
CREATE INDEX IF NOT EXISTS idx_photo_upload_sessions_active_token
    ON photo_upload_sessions (token_hash)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_photo_upload_sessions_owner_expiry
    ON photo_upload_sessions (empresa_id, profile_id, expires_at)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_photo_upload_session_items_session
    ON photo_upload_session_items (session_id, position);

-- servicos_catalogo
CREATE UNIQUE INDEX IF NOT EXISTS ux_servicos_catalogo_nome_ativo
    ON servicos_catalogo (LOWER(BTRIM(nome)))
    WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_servicos_catalogo_ativos_nome
    ON servicos_catalogo (ativo, nome);

-- produtos e gastos_fixos: exclusão lógica não deve reter o identificador
CREATE UNIQUE INDEX IF NOT EXISTS ux_produtos_codigo_ativo
    ON produtos (codigo)
    WHERE ativo = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_gastos_fixos_nome_ativo
    ON gastos_fixos (nome)
    WHERE ativo = true;

-- gastos_variaveis
CREATE INDEX IF NOT EXISTS idx_gastos_variaveis_data
    ON gastos_variaveis (data);

CREATE INDEX IF NOT EXISTS idx_gastos_variaveis_categoria_data
    ON gastos_variaveis (categoria, data);
