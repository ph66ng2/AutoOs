-- ═══════════════════════════════════════════════════════════════════════════════
-- supabase/schema.sql — Schema AutoOS para Supabase (PostgreSQL 15+)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Fonte de verdade: src-tauri/migrations/0001_initial_schema.sql … 0017_contatos_pagamento_orcamento.sql
-- Adaptações para Supabase:
--   • Todos os PKs são uuid (gen_random_uuid)
--   • empresa_id uuid NOT NULL em todas as tabelas sincronizáveis
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
    empresa_id uuid NOT NULL,
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
-- 2b. cliente_contatos
-- ═══════════════════════════════════════════════════════════════════════════════
-- Contatos são inativados; não há dados históricos inferidos automaticamente.
CREATE TABLE IF NOT EXISTS cliente_contatos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    cliente_id uuid NOT NULL,
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cliente_contatos_empresa
        FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente_contatos_cliente
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT,
    CONSTRAINT chk_cliente_contatos_nome_not_blank
        CHECK (BTRIM(nome) <> '') NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. equipamentos
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS equipamentos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
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
    cliente_documento TEXT,
    cliente_telefone TEXT,
    cliente_email TEXT,
    responsavel_contato_id uuid,
    responsavel_nome TEXT,
    responsavel_email TEXT,
    responsavel_telefone TEXT,
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
    CONSTRAINT fk_equipamentos_responsavel_contato
        FOREIGN KEY (responsavel_contato_id) REFERENCES cliente_contatos(id) ON DELETE SET NULL,
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
    empresa_id uuid NOT NULL,
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
    empresa_id uuid NOT NULL,
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
    empresa_id uuid NOT NULL,
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
    empresa_id uuid NOT NULL,
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
    forma_pagamento_codigo TEXT,
    forma_pagamento_detalhe TEXT,
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
        CHECK (tempo_estimado IS NULL OR tempo_estimado >= 0) NOT VALID,
    CONSTRAINT chk_verificacoes_forma_pagamento_codigo
        CHECK (
            forma_pagamento_codigo IS NULL
            OR forma_pagamento_codigo IN (
                'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO',
                'DINHEIRO', 'TRANSFERENCIA', 'A_COMBINAR', 'OUTRO'
            )
        ) NOT VALID,
    CONSTRAINT chk_verificacoes_forma_pagamento_outro_detalhe
        CHECK (
            forma_pagamento_codigo IS DISTINCT FROM 'OUTRO'
            OR NULLIF(BTRIM(forma_pagamento_detalhe), '') IS NOT NULL
        ) NOT VALID
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. comunicacoes
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS comunicacoes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
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
    empresa_id uuid NOT NULL,
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
    empresa_id uuid NOT NULL,
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
    empresa_id uuid NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    preco_padrao NUMERIC NOT NULL,
    pecas_sugeridas JSONB NOT NULL DEFAULT '[]'::jsonb,
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_servicos_catalogo_nome_not_blank
        CHECK (BTRIM(nome) <> '') NOT VALID,
    CONSTRAINT chk_servicos_catalogo_preco_non_negative
        CHECK (preco_padrao >= 0) NOT VALID,
    CONSTRAINT chk_servicos_catalogo_pecas_sugeridas_array
        CHECK (jsonb_typeof(pecas_sugeridas) = 'array') NOT VALID
);

ALTER TABLE public.servicos_catalogo
    ADD COLUMN IF NOT EXISTS pecas_sugeridas jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    ALTER TABLE public.servicos_catalogo
        ADD CONSTRAINT chk_servicos_catalogo_pecas_sugeridas_array
        CHECK (jsonb_typeof(pecas_sugeridas) = 'array') NOT VALID;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_pecas_sugeridas_servico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_peca jsonb;
    v_quantidade numeric;
    v_valor_unitario numeric;
BEGIN
    IF jsonb_typeof(NEW.pecas_sugeridas) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'As peças sugeridas devem ser uma lista.' USING ERRCODE = '22023';
    END IF;

    FOR v_peca IN
        SELECT item.value
          FROM jsonb_array_elements(NEW.pecas_sugeridas) AS item(value)
    LOOP
        IF jsonb_typeof(v_peca) IS DISTINCT FROM 'object'
            OR jsonb_typeof(v_peca -> 'produto_id') IS DISTINCT FROM 'string'
            OR jsonb_typeof(v_peca -> 'nome') IS DISTINCT FROM 'string'
            OR jsonb_typeof(v_peca -> 'quantidade') IS DISTINCT FROM 'number'
            OR jsonb_typeof(v_peca -> 'valor_unitario') IS DISTINCT FROM 'number'
            OR BTRIM(v_peca ->> 'nome') = ''
            OR (v_peca ->> 'produto_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN
            RAISE EXCEPTION 'Uma peça sugerida possui dados inválidos.' USING ERRCODE = '22023';
        END IF;

        v_quantidade := (v_peca ->> 'quantidade')::numeric;
        v_valor_unitario := (v_peca ->> 'valor_unitario')::numeric;
        IF v_quantidade < 1 OR TRUNC(v_quantidade) <> v_quantidade OR v_valor_unitario < 0 THEN
            RAISE EXCEPTION 'A quantidade e o preço da peça sugerida são inválidos.' USING ERRCODE = '22023';
        END IF;

        IF NOT EXISTS (
            SELECT 1
              FROM public.produtos AS produto
             WHERE produto.id = (v_peca ->> 'produto_id')::uuid
               AND produto.empresa_id = NEW.empresa_id
        ) THEN
            RAISE EXCEPTION 'A peça sugerida não pertence à empresa autenticada.' USING ERRCODE = '42501';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validar_pecas_sugeridas_servico() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_pecas_sugeridas_servico() TO authenticated;

DROP TRIGGER IF EXISTS trg_validar_pecas_sugeridas_servico ON public.servicos_catalogo;
CREATE TRIGGER trg_validar_pecas_sugeridas_servico
    BEFORE INSERT OR UPDATE OF pecas_sugeridas, empresa_id
    ON public.servicos_catalogo
    FOR EACH ROW
    EXECUTE FUNCTION public.validar_pecas_sugeridas_servico();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. gastos_fixos
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS gastos_fixos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
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
    empresa_id uuid NOT NULL,
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
-- 14. configuracoes_sistema (uma linha por empresa)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS configuracoes_sistema (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_equipamentos_responsavel_contato
    ON equipamentos (responsavel_contato_id)
    WHERE responsavel_contato_id IS NOT NULL;

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
CREATE INDEX IF NOT EXISTS idx_produtos_empresa_categoria_nome_ativo
    ON produtos (empresa_id, categoria, nome, id)
    WHERE ativo IS TRUE;
CREATE INDEX IF NOT EXISTS idx_produtos_empresa_nome_ativo
    ON produtos (empresa_id, nome, id)
    WHERE ativo IS TRUE;

-- movimentacoes_estoque
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto_data_hora_desc
    ON movimentacoes_estoque (produto_id, data_hora DESC);

-- Movimentações SaaS alteram o saldo e criam histórico na mesma transação.
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.enforce_saas_product_stock_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.quantidade_estoque IS DISTINCT FROM NEW.quantidade_estoque
       AND current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Product stock must be changed through a stock movement'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_saas_product_stock_movement()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS saas_product_stock_movement_guard ON public.produtos;
CREATE TRIGGER saas_product_stock_movement_guard
    BEFORE UPDATE OF quantidade_estoque ON public.produtos
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_product_stock_movement();

CREATE OR REPLACE FUNCTION private.normalize_saas_product_quantity_bounds()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF COALESCE(NEW.quantidade_maxima, 0) < COALESCE(NEW.quantidade_minima, 0) THEN
        NEW.quantidade_maxima := COALESCE(NEW.quantidade_minima, 0);
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.normalize_saas_product_quantity_bounds()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS saas_product_quantity_bounds ON public.produtos;
CREATE TRIGGER saas_product_quantity_bounds
    BEFORE INSERT OR UPDATE OF quantidade_minima, quantidade_maxima ON public.produtos
    FOR EACH ROW EXECUTE FUNCTION private.normalize_saas_product_quantity_bounds();

CREATE OR REPLACE VIEW public.produtos_estoque_baixo
WITH (security_invoker = true)
AS
SELECT *
  FROM public.produtos
 WHERE ativo IS TRUE
   AND COALESCE(quantidade_estoque, 0) < COALESCE(quantidade_minima, 0);

REVOKE ALL ON public.produtos_estoque_baixo FROM PUBLIC, anon;
GRANT SELECT ON public.produtos_estoque_baixo TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_movimentacao_estoque(
    p_produto_id uuid,
    p_tipo text,
    p_quantidade integer,
    p_origem text,
    p_referencia text DEFAULT NULL
)
RETURNS TABLE (
    movimentacao_id uuid,
    produto_id uuid,
    quantidade_estoque integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_empresa_id uuid;
    v_usuario text;
    v_tipo text := upper(btrim(COALESCE(p_tipo, '')));
    v_origem text := btrim(COALESCE(p_origem, ''));
    v_referencia text := NULLIF(btrim(COALESCE(p_referencia, '')), '');
    v_saldo integer;
    v_novo_saldo integer;
    v_movimentacao_id uuid;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR NOT private.saas_has_permission('STOCK_CONTROL') THEN
        RAISE EXCEPTION 'Stock control permission is required' USING ERRCODE = '42501';
    END IF;

    IF v_tipo NOT IN ('ENTRADA', 'SAIDA') THEN
        RAISE EXCEPTION 'Invalid stock movement type' USING ERRCODE = '22023';
    END IF;
    IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
        RAISE EXCEPTION 'Stock movement quantity must be positive' USING ERRCODE = '22023';
    END IF;
    IF v_origem = '' THEN
        RAISE EXCEPTION 'Stock movement origin is required' USING ERRCODE = '22023';
    END IF;

    SELECT identity.empresa_id, profile.nome
      INTO v_empresa_id, v_usuario
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;
    IF v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Active SaaS identity is required' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(product.quantidade_estoque, 0)
      INTO v_saldo
      FROM public.produtos AS product
     WHERE product.id = p_produto_id
       AND product.empresa_id = v_empresa_id
       AND product.ativo IS TRUE
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product is unavailable for this company' USING ERRCODE = 'P0002';
    END IF;

    IF v_tipo = 'SAIDA' AND v_saldo < p_quantidade THEN
        RAISE EXCEPTION 'Insufficient stock for this movement' USING ERRCODE = 'P0001';
    END IF;
    IF v_tipo = 'ENTRADA' AND v_saldo > 2147483647 - p_quantidade THEN
        RAISE EXCEPTION 'Stock exceeds the supported quantity range' USING ERRCODE = '22023';
    END IF;

    v_novo_saldo := CASE
        WHEN v_tipo = 'ENTRADA' THEN v_saldo + p_quantidade
        ELSE v_saldo - p_quantidade
    END;

    UPDATE public.produtos AS product
       SET quantidade_estoque = v_novo_saldo,
           atualizado_em = clock_timestamp()
     WHERE product.id = p_produto_id
       AND product.empresa_id = v_empresa_id
       AND product.ativo IS TRUE;

    INSERT INTO public.movimentacoes_estoque (
        empresa_id, produto_id, tipo, quantidade, origem, referencia, usuario, data_hora
    ) VALUES (
        v_empresa_id, p_produto_id, v_tipo, p_quantidade, v_origem, v_referencia, v_usuario, clock_timestamp()
    )
    RETURNING id INTO v_movimentacao_id;

    RETURN QUERY SELECT v_movimentacao_id, p_produto_id, v_novo_saldo;
END;
$$;

ALTER FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, text)
    OWNER TO postgres;

REVOKE ALL ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, text)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.registrar_movimentacao_estoque(uuid, text, integer, text, text)
    TO authenticated;

CREATE OR REPLACE FUNCTION private.enforce_saas_atomic_stock_movement_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user <> 'postgres' THEN
        RAISE EXCEPTION 'Stock movements must be created through the atomic stock RPC'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_saas_atomic_stock_movement_insert()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS saas_atomic_stock_movement_insert ON public.movimentacoes_estoque;
CREATE TRIGGER saas_atomic_stock_movement_insert
    BEFORE INSERT ON public.movimentacoes_estoque
    FOR EACH ROW EXECUTE FUNCTION private.enforce_saas_atomic_stock_movement_insert();

-- verificacoes
CREATE INDEX IF NOT EXISTS idx_verificacoes_equipamento_data_inicio_desc
    ON verificacoes (equipamento_id, data_inicio DESC);

-- cliente_contatos
CREATE INDEX IF NOT EXISTS idx_cliente_contatos_empresa
    ON cliente_contatos (empresa_id);

CREATE INDEX IF NOT EXISTS idx_cliente_contatos_cliente
    ON cliente_contatos (cliente_id);

CREATE INDEX IF NOT EXISTS idx_cliente_contatos_ativos
    ON cliente_contatos (empresa_id, cliente_id, nome)
    WHERE ativo = true;

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 18. Integridade multi-tenant para o schema SaaS
-- ═══════════════════════════════════════════════════════════════════════════════
-- O staging é multi-tenant desde a origem. UUID é o identificador canônico: não
-- existe mapeamento sequencial no runtime SaaS. Estas restrições também impedem
-- que uma FK aponte, por engano, para uma linha de outra empresa.

ALTER TABLE configuracoes_sistema
    DROP CONSTRAINT IF EXISTS configuracoes_sistema_id_check;
ALTER TABLE configuracoes_sistema
    ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_documento_key;
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_cpf_cnpj_key;
ALTER TABLE security_profiles DROP CONSTRAINT IF EXISTS security_profiles_nome_key;

ALTER TABLE clientes ADD CONSTRAINT uq_clientes_empresa_id UNIQUE (empresa_id, id);
ALTER TABLE cliente_contatos ADD CONSTRAINT uq_cliente_contatos_empresa_cliente_id UNIQUE (empresa_id, cliente_id, id);
ALTER TABLE equipamentos ADD CONSTRAINT uq_equipamentos_empresa_id UNIQUE (empresa_id, id);
ALTER TABLE produtos ADD CONSTRAINT uq_produtos_empresa_id UNIQUE (empresa_id, id);
ALTER TABLE security_profiles ADD CONSTRAINT uq_security_profiles_empresa_id UNIQUE (empresa_id, id);
ALTER TABLE gastos_fixos ADD CONSTRAINT uq_gastos_fixos_empresa_id UNIQUE (empresa_id, id);

ALTER TABLE clientes ADD CONSTRAINT fk_clientes_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE equipamentos ADD CONSTRAINT fk_equipamentos_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE produtos ADD CONSTRAINT fk_produtos_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE movimentacoes_estoque ADD CONSTRAINT fk_movimentacoes_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE security_profiles ADD CONSTRAINT fk_security_profiles_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE verificacoes ADD CONSTRAINT fk_verificacoes_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE comunicacoes ADD CONSTRAINT fk_comunicacoes_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE security_audit_log ADD CONSTRAINT fk_security_audit_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE equipamento_imagens ADD CONSTRAINT fk_equipamento_imagens_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE servicos_catalogo ADD CONSTRAINT fk_servicos_catalogo_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE gastos_fixos ADD CONSTRAINT fk_gastos_fixos_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE gastos_variaveis ADD CONSTRAINT fk_gastos_variaveis_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
ALTER TABLE configuracoes_sistema ADD CONSTRAINT fk_configuracoes_sistema_empresa
    FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;

ALTER TABLE equipamentos DROP CONSTRAINT IF EXISTS fk_equipamentos_cliente;
ALTER TABLE equipamentos ADD CONSTRAINT fk_equipamentos_cliente_empresa
    FOREIGN KEY (empresa_id, cliente_id) REFERENCES clientes(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE cliente_contatos DROP CONSTRAINT IF EXISTS fk_cliente_contatos_cliente;
ALTER TABLE cliente_contatos ADD CONSTRAINT fk_cliente_contatos_cliente_empresa
    FOREIGN KEY (empresa_id, cliente_id) REFERENCES clientes(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE cliente_contatos ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE equipamentos DROP CONSTRAINT IF EXISTS fk_equipamentos_responsavel_contato;
ALTER TABLE equipamentos ADD CONSTRAINT fk_equipamentos_responsavel_cliente_empresa
    FOREIGN KEY (empresa_id, cliente_id, responsavel_contato_id)
    REFERENCES cliente_contatos(empresa_id, cliente_id, id)
    ON DELETE SET NULL (responsavel_contato_id);
ALTER TABLE equipamentos ADD CONSTRAINT chk_equipamentos_responsavel_requires_cliente
    CHECK (responsavel_contato_id IS NULL OR cliente_id IS NOT NULL) NOT VALID;
ALTER TABLE movimentacoes_estoque DROP CONSTRAINT IF EXISTS fk_movimentacoes_produto;
ALTER TABLE movimentacoes_estoque ADD CONSTRAINT fk_movimentacoes_produto_empresa
    FOREIGN KEY (empresa_id, produto_id) REFERENCES produtos(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE verificacoes DROP CONSTRAINT IF EXISTS fk_verificacoes_equipamento;
ALTER TABLE verificacoes ADD CONSTRAINT fk_verificacoes_equipamento_empresa
    FOREIGN KEY (empresa_id, equipamento_id) REFERENCES equipamentos(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE verificacoes DROP CONSTRAINT IF EXISTS fk_verificacoes_adjusted_by_profile;
ALTER TABLE verificacoes ADD CONSTRAINT fk_verificacoes_profile_empresa
    FOREIGN KEY (empresa_id, adjusted_by_profile_id) REFERENCES security_profiles(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE comunicacoes DROP CONSTRAINT IF EXISTS fk_comunicacoes_equipamento;
ALTER TABLE comunicacoes ADD CONSTRAINT fk_comunicacoes_equipamento_empresa
    FOREIGN KEY (empresa_id, equipamento_id) REFERENCES equipamentos(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE security_audit_log DROP CONSTRAINT IF EXISTS fk_audit_profile;
ALTER TABLE security_audit_log ADD CONSTRAINT fk_audit_profile_empresa
    FOREIGN KEY (empresa_id, profile_id) REFERENCES security_profiles(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE equipamento_imagens DROP CONSTRAINT IF EXISTS fk_equipamento_imagens_equipamento;
ALTER TABLE equipamento_imagens ADD CONSTRAINT fk_equipamento_imagens_equipamento_empresa
    FOREIGN KEY (empresa_id, equipamento_id) REFERENCES equipamentos(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE gastos_variaveis DROP CONSTRAINT IF EXISTS fk_gastos_variaveis_referencia;
ALTER TABLE gastos_variaveis ADD CONSTRAINT fk_gastos_variaveis_referencia_empresa
    FOREIGN KEY (empresa_id, referencia_id) REFERENCES gastos_fixos(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE os_status_publico DROP CONSTRAINT IF EXISTS fk_os_status_publico_equipamento;
ALTER TABLE os_status_publico ADD CONSTRAINT fk_os_status_publico_equipamento_empresa
    FOREIGN KEY (empresa_id, equipamento) REFERENCES equipamentos(empresa_id, id) ON DELETE RESTRICT;

ALTER TABLE photo_upload_sessions DROP CONSTRAINT IF EXISTS photo_upload_sessions_profile_id_fkey;
ALTER TABLE photo_upload_sessions ADD CONSTRAINT fk_photo_upload_sessions_profile_empresa
    FOREIGN KEY (empresa_id, profile_id) REFERENCES security_profiles(empresa_id, id) ON DELETE RESTRICT;
ALTER TABLE photo_upload_sessions DROP CONSTRAINT IF EXISTS photo_upload_sessions_equipamento_id_fkey;
ALTER TABLE photo_upload_sessions ADD CONSTRAINT fk_photo_upload_sessions_equipamento_empresa
    FOREIGN KEY (empresa_id, equipamento_id) REFERENCES equipamentos(empresa_id, id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_empresa_documento_ativo
    ON clientes (empresa_id, documento)
    WHERE ativo = true AND documento IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_empresa_cpf_cnpj_ativo
    ON clientes (empresa_id, cpf_cnpj)
    WHERE ativo = true AND cpf_cnpj IS NOT NULL;
ALTER TABLE security_profiles ADD CONSTRAINT uq_security_profiles_empresa_nome UNIQUE (empresa_id, nome);
ALTER TABLE configuracoes_sistema ADD CONSTRAINT uq_configuracoes_sistema_empresa UNIQUE (empresa_id);

ALTER TABLE clientes ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE equipamentos ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE produtos ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE movimentacoes_estoque ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE security_profiles ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE verificacoes ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE comunicacoes ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE security_audit_log ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE equipamento_imagens ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE servicos_catalogo ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE gastos_fixos ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE gastos_variaveis ALTER COLUMN empresa_id DROP DEFAULT;
ALTER TABLE configuracoes_sistema ALTER COLUMN empresa_id DROP DEFAULT;

DROP INDEX IF EXISTS ux_equipamentos_patrimonio_when_present;
CREATE UNIQUE INDEX ux_equipamentos_patrimonio_when_present
    ON equipamentos (empresa_id, (LOWER(BTRIM(patrimonio))))
    WHERE NULLIF(BTRIM(patrimonio), '') IS NOT NULL;
DROP INDEX IF EXISTS ux_security_profiles_single_default_active;
CREATE UNIQUE INDEX ux_security_profiles_single_default_active
    ON security_profiles (empresa_id)
    WHERE ativo = true AND is_default = true;
DROP INDEX IF EXISTS ux_servicos_catalogo_nome_ativo;
CREATE UNIQUE INDEX ux_servicos_catalogo_nome_ativo
    ON servicos_catalogo (empresa_id, LOWER(BTRIM(nome)))
    WHERE ativo = true;
DROP INDEX IF EXISTS ux_produtos_codigo_ativo;
CREATE UNIQUE INDEX ux_produtos_codigo_ativo
    ON produtos (empresa_id, codigo)
    WHERE ativo = true;
DROP INDEX IF EXISTS ux_gastos_fixos_nome_ativo;
CREATE UNIQUE INDEX ux_gastos_fixos_nome_ativo
    ON gastos_fixos (empresa_id, LOWER(BTRIM(nome)))
    WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes (empresa_id);
CREATE INDEX IF NOT EXISTS idx_equipamentos_empresa ON equipamentos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_equipamentos_empresa_cliente
    ON equipamentos (empresa_id, cliente_id)
    WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_produtos_empresa ON produtos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_estoque_empresa ON movimentacoes_estoque (empresa_id);
CREATE INDEX IF NOT EXISTS idx_security_profiles_empresa ON security_profiles (empresa_id);
CREATE INDEX IF NOT EXISTS idx_verificacoes_empresa ON verificacoes (empresa_id);
CREATE INDEX IF NOT EXISTS idx_comunicacoes_empresa ON comunicacoes (empresa_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_empresa ON security_audit_log (empresa_id);
CREATE INDEX IF NOT EXISTS idx_equipamento_imagens_empresa ON equipamento_imagens (empresa_id);
CREATE INDEX IF NOT EXISTS idx_servicos_catalogo_empresa ON servicos_catalogo (empresa_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fixos_empresa ON gastos_fixos (empresa_id);
CREATE INDEX IF NOT EXISTS idx_gastos_variaveis_empresa ON gastos_variaveis (empresa_id);
CREATE INDEX IF NOT EXISTS idx_configuracoes_sistema_empresa ON configuracoes_sistema (empresa_id);
-- Regras operacionais SaaS: categorias de estoque e consumo de peças por
-- serviço aprovado. Nunca editar migrations já aplicadas.
--
-- Rollback: interrompa as operações do SaaS antes de remover funções, policies,
-- tabelas e colunas criadas abaixo. A normalização de categoria é intencional e
-- não recupera o texto legado exato; restaure-o somente de backup. Movimentos e
-- baixas de estoque são registros operacionais: nunca os apague para reverter
-- esta migration; corrija saldo com movimento compensatório ou migration aditiva.

UPDATE public.produtos
   SET categoria = CASE
       WHEN upper(btrim(categoria)) = 'ROLO' AND codigo LIKE 'ETQ-%' THEN 'ETIQUETA'
       WHEN upper(btrim(categoria)) IN ('TONER', 'CARTUCHO', 'RIBBON') THEN 'RIBBON'
       WHEN upper(btrim(categoria)) IN ('PEÇA', 'PECA', 'FUSOR', 'CILINDRO', 'ROLO') THEN 'PEÇA'
       WHEN upper(btrim(categoria)) = 'IMPRESSORA' THEN 'IMPRESSORA'
       WHEN upper(btrim(categoria)) = 'ETIQUETA' THEN 'ETIQUETA'
       ELSE 'OUTROS'
   END
 WHERE categoria NOT IN ('IMPRESSORA', 'PEÇA', 'ETIQUETA', 'RIBBON', 'OUTROS');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.produtos'::regclass
           AND conname = 'chk_produtos_categoria_operacional'
    ) THEN
        ALTER TABLE public.produtos
            ADD CONSTRAINT chk_produtos_categoria_operacional
            CHECK (categoria IN ('IMPRESSORA', 'PEÇA', 'ETIQUETA', 'RIBBON', 'OUTROS'));
    END IF;
END;
$$;

ALTER TABLE public.verificacoes
    ADD COLUMN IF NOT EXISTS servicos_orcamento_original jsonb,
    ADD COLUMN IF NOT EXISTS pecas_orcamento_original jsonb,
    ADD COLUMN IF NOT EXISTS valor_orcamento_original numeric;

CREATE UNIQUE INDEX IF NOT EXISTS uq_verificacoes_empresa_id
    ON public.verificacoes (empresa_id, id);

CREATE TABLE IF NOT EXISTS public.orcamento_servicos_decisao (
    verificacao_id uuid NOT NULL,
    servico_id text NOT NULL,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    decisao text NOT NULL CHECK (decisao IN ('APROVADO', 'REPROVADO')),
    decidido_em timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (verificacao_id, servico_id),
    CONSTRAINT fk_orcamento_decisao_verificacao_empresa
        FOREIGN KEY (empresa_id, verificacao_id)
        REFERENCES public.verificacoes (empresa_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.orcamento_consumos (
    verificacao_id uuid NOT NULL,
    servico_id text NOT NULL,
    produto_id uuid NOT NULL,
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    quantidade_aprovada integer NOT NULL CHECK (quantidade_aprovada >= 0),
    quantidade_baixada integer NOT NULL DEFAULT 0 CHECK (quantidade_baixada >= 0),
    PRIMARY KEY (verificacao_id, servico_id, produto_id),
    CONSTRAINT fk_orcamento_consumos_verificacao_empresa
        FOREIGN KEY (empresa_id, verificacao_id)
        REFERENCES public.verificacoes (empresa_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_orcamento_consumos_produto_empresa
        FOREIGN KEY (empresa_id, produto_id)
        REFERENCES public.produtos (empresa_id, id) ON DELETE RESTRICT,
    CHECK (quantidade_baixada <= quantidade_aprovada)
);

CREATE INDEX IF NOT EXISTS idx_orcamento_decisao_empresa
    ON public.orcamento_servicos_decisao (empresa_id, verificacao_id);
CREATE INDEX IF NOT EXISTS idx_orcamento_consumos_pendentes
    ON public.orcamento_consumos (empresa_id, verificacao_id, produto_id)
    WHERE quantidade_baixada < quantidade_aprovada;
CREATE INDEX IF NOT EXISTS idx_orcamento_consumos_produto_empresa
    ON public.orcamento_consumos (empresa_id, produto_id);

ALTER TABLE public.orcamento_servicos_decisao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_consumos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orcamento_servicos_decisao, public.orcamento_consumos FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS orcamento_decisao_empresa ON public.orcamento_servicos_decisao;
CREATE POLICY orcamento_decisao_empresa ON public.orcamento_servicos_decisao
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT public.current_company_id()));
DROP POLICY IF EXISTS orcamento_consumos_empresa ON public.orcamento_consumos;
CREATE POLICY orcamento_consumos_empresa ON public.orcamento_consumos
    FOR SELECT TO authenticated
    USING (empresa_id = (SELECT public.current_company_id()));

CREATE OR REPLACE FUNCTION public.saas_approve_equipment_quote_with_stock(
    p_equipment_id uuid,
    p_expected_updated_em timestamp without time zone,
    p_payment_code text,
    p_payment_detail text,
    p_services_approved text[] DEFAULT NULL
)
RETURNS public.equipamentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_equipment public.equipamentos%ROWTYPE;
    v_verification public.verificacoes%ROWTYPE;
    v_actor text;
    v_services jsonb;
    v_original_parts jsonb;
    v_service record;
    v_part record;
    v_service_id text;
    v_service_ids text[] := ARRAY[]::text[];
    v_approved_ids text[] := ARRAY[]::text[];
    v_product_ids uuid[] := ARRAY[]::uuid[];
    v_product_id uuid;
    v_quantity numeric;
    v_unit_price numeric;
    v_service_value numeric;
    v_previous_approved integer;
    v_previously_debited integer;
    v_new_approved integer;
    v_to_debit integer;
    v_available integer;
    v_debit integer;
    v_service_count integer;
    v_approved_count integer;
    v_total numeric := 0;
    v_services_total numeric := 0;
    v_parts_total numeric := 0;
    v_total_to_save numeric;
    v_all_approved boolean;
    v_approved boolean;
    v_services_to_save jsonb := '[]'::jsonb;
    v_parts_to_save jsonb := '[]'::jsonb;
    v_normalized_service jsonb;
    v_new_status text;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active SaaS identity is required' USING ERRCODE = '42501';
    END IF;
    IF NOT private.saas_has_permission('FINANCIAL_ACTIONS') THEN
        RAISE EXCEPTION 'Financial actions permission is required' USING ERRCODE = '42501';
    END IF;
    IF p_payment_code IS NULL OR p_payment_code NOT IN (
        'PIX', 'BOLETO', 'CARTAO_CREDITO', 'CARTAO_DEBITO',
        'DINHEIRO', 'TRANSFERENCIA', 'A_COMBINAR', 'OUTRO'
    ) OR (p_payment_code = 'OUTRO' AND NULLIF(btrim(p_payment_detail), '') IS NULL) THEN
        RAISE EXCEPTION 'Payment method is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT profile.nome
      INTO v_actor
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Active SaaS profile is required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_equipment
      FROM public.equipamentos AS item
     WHERE item.id = p_equipment_id AND item.empresa_id = v_tenant_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    IF v_equipment.atualizado_em IS DISTINCT FROM p_expected_updated_em THEN
        RAISE EXCEPTION 'Equipment changed; reload and try again' USING ERRCODE = '40001';
    END IF;
    IF upper(coalesce(v_equipment.status, '')) <> 'AGUARDANDO_APROVACAO' THEN
        RAISE EXCEPTION 'Only quotes awaiting approval can be approved' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_verification
      FROM public.verificacoes AS item
     WHERE item.equipamento_id = v_equipment.id AND item.empresa_id = v_tenant_id
     ORDER BY item.data_inicio DESC NULLS LAST, item.id DESC
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'A technical verification is required before approval' USING ERRCODE = 'P0002';
    END IF;

    BEGIN
        v_services := coalesce(v_verification.servicos_necessarios::jsonb, '[]'::jsonb);
        v_original_parts := coalesce(v_verification.pecas_necessarias::jsonb, '[]'::jsonb);
    EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'Quote services or parts are invalid' USING ERRCODE = '22023';
    END;
    IF jsonb_typeof(v_services) IS DISTINCT FROM 'array'
       OR jsonb_typeof(v_original_parts) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Quote services and parts must be arrays' USING ERRCODE = '22023';
    END IF;

    FOR v_service IN
        SELECT item.value, item.ordinality
          FROM jsonb_array_elements(v_services) WITH ORDINALITY AS item(value, ordinality)
    LOOP
        IF jsonb_typeof(v_service.value) IS DISTINCT FROM 'object' THEN
            RAISE EXCEPTION 'A quote service is invalid' USING ERRCODE = '22023';
        END IF;
        v_service_id := coalesce(nullif(v_service.value ->> 'id', ''), 'legacy:' || (v_service.ordinality - 1)::text);
        IF v_service_id = ANY(v_service_ids) THEN
            RAISE EXCEPTION 'Quote service identifiers must be unique' USING ERRCODE = '22023';
        END IF;
        v_service_ids := array_append(v_service_ids, v_service_id);
        IF jsonb_typeof(v_service.value -> 'valor') IS DISTINCT FROM 'number'
           OR (v_service.value ->> 'valor')::numeric < 0 THEN
            RAISE EXCEPTION 'Quote service value is invalid' USING ERRCODE = '22023';
        END IF;
        IF v_service.value ? 'pecas'
           AND jsonb_typeof(v_service.value -> 'pecas') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'Quote service parts must be an array' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    v_service_count := cardinality(v_service_ids);

    -- Cancel pending quantities only for services removed from the quote.
    -- Pending quantities that still belong to an approved service remain
    -- pending until an operator confirms them from the equipment order.
    UPDATE public.orcamento_consumos AS consumption
       SET quantidade_aprovada = consumption.quantidade_baixada
     WHERE consumption.verificacao_id = v_verification.id
       AND consumption.empresa_id = v_tenant_id
       AND consumption.servico_id <> ALL(v_service_ids);

    IF p_services_approved IS NULL THEN
        v_approved_ids := v_service_ids;
    ELSE
        FOREACH v_service_id IN ARRAY p_services_approved LOOP
            IF v_service_id IS NULL OR btrim(v_service_id) = ''
               OR NOT (v_service_id = ANY(v_service_ids))
               OR v_service_id = ANY(v_approved_ids) THEN
                RAISE EXCEPTION 'Approved services contain a duplicate or unknown identifier' USING ERRCODE = '22023';
            END IF;
            v_approved_ids := array_append(v_approved_ids, v_service_id);
        END LOOP;
    END IF;
    v_approved_count := cardinality(v_approved_ids);
    v_all_approved := v_approved_count = v_service_count;
    v_approved := p_services_approved IS NULL OR v_approved_count > 0;
    v_new_status := CASE WHEN v_approved THEN 'APROVADO' ELSE 'REPROVADO' END;

    -- Lock all affected products in the same order to avoid cross-OS deadlocks.
    FOR v_service IN
        SELECT item.value, item.ordinality
          FROM jsonb_array_elements(v_services) WITH ORDINALITY AS item(value, ordinality)
    LOOP
        v_service_id := coalesce(nullif(v_service.value ->> 'id', ''), 'legacy:' || (v_service.ordinality - 1)::text);
        IF v_service_id = ANY(v_approved_ids) THEN
            FOR v_part IN
                SELECT item.value
                  FROM jsonb_array_elements(coalesce(v_service.value -> 'pecas', '[]'::jsonb)) AS item(value)
            LOOP
                IF jsonb_typeof(v_part.value) IS DISTINCT FROM 'object'
                   OR coalesce(v_part.value ->> 'produto_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                   OR jsonb_typeof(v_part.value -> 'quantidade') IS DISTINCT FROM 'number'
                   OR jsonb_typeof(v_part.value -> 'valor_unitario') IS DISTINCT FROM 'number' THEN
                    RAISE EXCEPTION 'A linked product or quantity is invalid' USING ERRCODE = '22023';
                END IF;
                v_quantity := (v_part.value ->> 'quantidade')::numeric;
                v_unit_price := (v_part.value ->> 'valor_unitario')::numeric;
                IF v_quantity <= 0 OR trunc(v_quantity) <> v_quantity OR v_quantity > 2147483647
                   OR v_unit_price < 0 OR v_unit_price::text = 'NaN' THEN
                    RAISE EXCEPTION 'A linked product quantity or value is invalid' USING ERRCODE = '22023';
                END IF;
                v_product_ids := array_append(v_product_ids, (v_part.value ->> 'produto_id')::uuid);
            END LOOP;
        END IF;
    END LOOP;

    SELECT coalesce(array_agg(DISTINCT item.id ORDER BY item.id), ARRAY[]::uuid[])
      INTO v_product_ids
      FROM unnest(v_product_ids) AS item(id);
    IF cardinality(v_product_ids) > 0 AND NOT private.saas_has_permission('STOCK_CONTROL') THEN
        RAISE EXCEPTION 'Stock control permission is required for linked parts' USING ERRCODE = '42501';
    END IF;
    IF cardinality(v_product_ids) > 0 THEN
        PERFORM product.id
          FROM public.produtos AS product
         WHERE product.id = ANY(v_product_ids)
           AND product.empresa_id = v_tenant_id
           AND product.ativo IS TRUE
         ORDER BY product.id
         FOR UPDATE;
        IF (SELECT count(*) FROM public.produtos AS product
             WHERE product.id = ANY(v_product_ids)
               AND product.empresa_id = v_tenant_id
               AND product.ativo IS TRUE) <> cardinality(v_product_ids) THEN
            RAISE EXCEPTION 'A linked product is unavailable for the active company' USING ERRCODE = 'P0002';
        END IF;
    END IF;

    IF v_approved AND v_approved_count > 0 AND EXISTS (
        SELECT 1
          FROM jsonb_array_elements(v_original_parts) AS saved(value)
         WHERE coalesce(saved.value ->> 'id', '') = ''
            OR NOT EXISTS (
                SELECT 1
                  FROM jsonb_array_elements(v_services) WITH ORDINALITY AS service(value, ordinality)
                  CROSS JOIN LATERAL jsonb_array_elements(coalesce(service.value -> 'pecas', '[]'::jsonb)) AS part(value)
                 WHERE concat(
                     coalesce(nullif(service.value ->> 'id', ''), 'legacy:' || (service.ordinality - 1)::text),
                     ':', part.value ->> 'produto_id'
                 ) = saved.value ->> 'id'
            )
    ) THEN
        RAISE EXCEPTION 'Legacy parts must be linked to a service before approval' USING ERRCODE = '22023';
    END IF;

    FOR v_service IN
        SELECT item.value, item.ordinality
          FROM jsonb_array_elements(v_services) WITH ORDINALITY AS item(value, ordinality)
    LOOP
        v_service_id := coalesce(nullif(v_service.value ->> 'id', ''), 'legacy:' || (v_service.ordinality - 1)::text);
        INSERT INTO public.orcamento_servicos_decisao (verificacao_id, servico_id, empresa_id, decisao)
        VALUES (
            v_verification.id,
            v_service_id,
            v_tenant_id,
            CASE WHEN v_service_id = ANY(v_approved_ids) THEN 'APROVADO' ELSE 'REPROVADO' END
        )
        ON CONFLICT (verificacao_id, servico_id) DO UPDATE
           SET decisao = EXCLUDED.decisao, decidido_em = clock_timestamp();

        IF v_service_id <> ALL(v_approved_ids) THEN
            UPDATE public.orcamento_consumos AS consumption
               SET quantidade_aprovada = consumption.quantidade_baixada
             WHERE consumption.verificacao_id = v_verification.id
               AND consumption.servico_id = v_service_id
               AND consumption.empresa_id = v_tenant_id;
            CONTINUE;
        END IF;

        v_normalized_service := jsonb_set(v_service.value, '{id}', to_jsonb(v_service_id), true);
        v_services_to_save := v_services_to_save || jsonb_build_array(v_normalized_service);
        v_service_value := (v_service.value ->> 'valor')::numeric;
        v_total := v_total + v_service_value;
        v_services_total := v_services_total + v_service_value;

        -- If an approved service no longer uses a previously linked product,
        -- close only that product's old pending quantity without refunding
        -- stock that was already consumed.
        UPDATE public.orcamento_consumos AS consumption
           SET quantidade_aprovada = consumption.quantidade_baixada
         WHERE consumption.verificacao_id = v_verification.id
           AND consumption.servico_id = v_service_id
           AND consumption.empresa_id = v_tenant_id
           AND NOT EXISTS (
               SELECT 1
                 FROM jsonb_array_elements(coalesce(v_service.value -> 'pecas', '[]'::jsonb)) AS part(value)
                WHERE part.value ->> 'produto_id' = consumption.produto_id::text
           );

        FOR v_part IN
            SELECT (item.value ->> 'produto_id')::uuid AS produto_id,
                   sum((item.value ->> 'quantidade')::numeric)::integer AS quantidade,
                   min(item.value ->> 'nome') AS nome,
                   sum((item.value ->> 'quantidade')::numeric * (item.value ->> 'valor_unitario')::numeric) AS total_peca,
                   min((item.value ->> 'valor_unitario')::numeric) AS valor_unitario
              FROM jsonb_array_elements(coalesce(v_service.value -> 'pecas', '[]'::jsonb)) AS item(value)
             GROUP BY (item.value ->> 'produto_id')::uuid
             ORDER BY (item.value ->> 'produto_id')::uuid
        LOOP
            v_total := v_total + v_part.total_peca;
            v_parts_total := v_parts_total + v_part.total_peca;
            v_parts_to_save := v_parts_to_save || jsonb_build_array(jsonb_build_object(
                'id', v_service_id || ':' || v_part.produto_id::text,
                'produto_id', v_part.produto_id,
                'servico_id', v_service_id,
                'nome', v_part.nome,
                'quantidade', v_part.quantidade,
                'valorUnitario', v_part.valor_unitario,
                'valorTotal', v_part.total_peca
            ));

            SELECT consumption.quantidade_aprovada, consumption.quantidade_baixada
              INTO v_previous_approved, v_previously_debited
              FROM public.orcamento_consumos AS consumption
             WHERE consumption.verificacao_id = v_verification.id
               AND consumption.servico_id = v_service_id
               AND consumption.produto_id = v_part.produto_id
             FOR UPDATE;
            IF NOT FOUND THEN
                v_previous_approved := 0;
                v_previously_debited := 0;
            END IF;
            v_new_approved := greatest(v_part.quantidade, v_previously_debited);
            INSERT INTO public.orcamento_consumos (
                verificacao_id, servico_id, produto_id, empresa_id,
                quantidade_aprovada, quantidade_baixada
            ) VALUES (
                v_verification.id, v_service_id, v_part.produto_id, v_tenant_id,
                v_new_approved, coalesce(v_previously_debited, 0)
            )
            ON CONFLICT (verificacao_id, servico_id, produto_id) DO UPDATE
               SET quantidade_aprovada = EXCLUDED.quantidade_aprovada;

            v_to_debit := greatest(v_new_approved - v_previous_approved, 0);
            IF v_to_debit > 0 THEN
                SELECT greatest(coalesce(product.quantidade_estoque, 0), 0)
                  INTO v_available
                  FROM public.produtos AS product
                 WHERE product.id = v_part.produto_id
                   AND product.empresa_id = v_tenant_id
                   AND product.ativo IS TRUE
                 FOR UPDATE;
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'A linked product is unavailable for the active company' USING ERRCODE = 'P0002';
                END IF;
                v_debit := least(v_available, v_to_debit);
                IF v_debit > 0 THEN
                    UPDATE public.produtos AS product
                       SET quantidade_estoque = coalesce(product.quantidade_estoque, 0) - v_debit,
                           atualizado_em = clock_timestamp()
                     WHERE product.id = v_part.produto_id AND product.empresa_id = v_tenant_id;
                    INSERT INTO public.movimentacoes_estoque (
                        empresa_id, produto_id, tipo, quantidade, origem, referencia, usuario, data_hora
                    ) VALUES (
                        v_tenant_id, v_part.produto_id, 'SAIDA', v_debit, 'MANUTENCAO',
                        'verificacao:' || v_verification.id::text || ';servico:' || v_service_id,
                        v_actor, clock_timestamp()
                    );
                    UPDATE public.orcamento_consumos AS consumption
                       SET quantidade_baixada = consumption.quantidade_baixada + v_debit
                     WHERE consumption.verificacao_id = v_verification.id
                       AND consumption.servico_id = v_service_id
                       AND consumption.produto_id = v_part.produto_id
                       AND consumption.empresa_id = v_tenant_id;
                END IF;
            END IF;
        END LOOP;
    END LOOP;

    IF v_approved THEN
        v_total_to_save := CASE
            WHEN v_all_approved THEN coalesce(v_verification.custo_total, v_total)
            ELSE v_total
        END;
        IF v_total_to_save < 0 OR v_total_to_save::text = 'NaN' THEN
            RAISE EXCEPTION 'Approved quote total is invalid' USING ERRCODE = '22023';
        END IF;
    ELSE
        v_services_to_save := v_services;
        v_parts_to_save := v_original_parts;
        v_total_to_save := coalesce(v_verification.custo_total, 0);
    END IF;

    UPDATE public.verificacoes AS item
       SET forma_pagamento_codigo = p_payment_code,
           forma_pagamento_detalhe = CASE WHEN p_payment_code = 'OUTRO' THEN nullif(btrim(p_payment_detail), '') ELSE NULL END,
           servicos_orcamento_original = coalesce(item.servicos_orcamento_original, v_services),
           pecas_orcamento_original = coalesce(item.pecas_orcamento_original, v_original_parts),
           valor_orcamento_original = coalesce(item.valor_orcamento_original, item.custo_total),
           servicos_necessarios = v_services_to_save::text,
           pecas_necessarias = v_parts_to_save::text,
           custo_estimado_mao_obra = CASE WHEN v_approved AND NOT v_all_approved THEN round(v_services_total, 2) ELSE item.custo_estimado_mao_obra END,
           custo_estimado_pecas = CASE WHEN v_approved AND NOT v_all_approved THEN round(v_parts_total, 2) ELSE item.custo_estimado_pecas END,
           custo_total = v_total_to_save
     WHERE item.id = v_verification.id
       AND item.equipamento_id = v_equipment.id
       AND item.empresa_id = v_tenant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verification changed during quote approval' USING ERRCODE = '40001';
    END IF;

    UPDATE public.equipamentos AS item
       SET status = v_new_status,
           valor_orcamento = v_total_to_save,
           data_aprovacao = CASE WHEN v_approved THEN current_date::text ELSE item.data_aprovacao END,
           data_reprovacao = CASE WHEN NOT v_approved THEN current_date::text ELSE item.data_reprovacao END,
           atualizado_em = clock_timestamp()
     WHERE item.id = v_equipment.id AND item.empresa_id = v_tenant_id
     RETURNING * INTO v_equipment;
    RETURN v_equipment;
END;
$$;

ALTER FUNCTION public.saas_approve_equipment_quote_with_stock(uuid, timestamp, text, text, text[])
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_approve_equipment_quote_with_stock(uuid, timestamp, text, text, text[])
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.saas_approve_equipment_quote_with_stock(uuid, timestamp, text, text, text[])
    TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_list_equipment_quote_consumption(p_equipment_id uuid)
RETURNS TABLE (
    verificacao_id uuid,
    servico_id text,
    produto_id uuid,
    nome text,
    quantidade_aprovada integer,
    quantidade_baixada integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL
       OR NOT private.saas_has_permission('STOCK_CONTROL') THEN
        RAISE EXCEPTION 'Stock control permission is required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.equipamentos AS equipment
         WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
    ) THEN
        RAISE EXCEPTION 'Equipment was not found for the active company' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT consumption.verificacao_id, consumption.servico_id, consumption.produto_id,
           product.nome, consumption.quantidade_aprovada, consumption.quantidade_baixada
      FROM public.orcamento_consumos AS consumption
      JOIN public.verificacoes AS verification
        ON verification.id = consumption.verificacao_id
       AND verification.empresa_id = consumption.empresa_id
      JOIN public.equipamentos AS equipment
        ON equipment.id = verification.equipamento_id
       AND equipment.empresa_id = consumption.empresa_id
      JOIN public.produtos AS product
        ON product.id = consumption.produto_id
       AND product.empresa_id = consumption.empresa_id
     WHERE equipment.id = p_equipment_id
       AND consumption.empresa_id = v_tenant_id
     ORDER BY consumption.servico_id, product.nome, product.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.saas_consume_pending_equipment_parts(p_equipment_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_equipment public.equipamentos%ROWTYPE;
    v_actor text;
    v_pending record;
    v_available integer;
    v_debit integer;
    v_total bigint := 0;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL
       OR NOT private.saas_has_permission('STOCK_CONTROL') THEN
        RAISE EXCEPTION 'Stock control permission is required' USING ERRCODE = '42501';
    END IF;
    SELECT profile.nome
      INTO v_actor
      FROM private.current_saas_session_identity() AS identity
      JOIN public.security_profiles AS profile
        ON profile.id = identity.profile_id
       AND profile.empresa_id = identity.empresa_id
       AND profile.ativo IS TRUE
     LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Active SaaS profile is required' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_equipment
      FROM public.equipamentos AS equipment
     WHERE equipment.id = p_equipment_id
       AND equipment.empresa_id = v_tenant_id
       AND equipment.status IN ('APROVADO', 'EM_MANUTENCAO', 'AGUARDANDO_PECA', 'PRONTO')
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'OS is not approved or is unavailable for this company' USING ERRCODE = '22023';
    END IF;

    FOR v_pending IN
        SELECT consumption.verificacao_id, consumption.servico_id, consumption.produto_id,
               consumption.quantidade_aprovada - consumption.quantidade_baixada AS restante
          FROM public.orcamento_consumos AS consumption
          JOIN public.orcamento_servicos_decisao AS decision
            ON decision.verificacao_id = consumption.verificacao_id
           AND decision.servico_id = consumption.servico_id
           AND decision.empresa_id = consumption.empresa_id
           AND decision.decisao = 'APROVADO'
          JOIN public.verificacoes AS verification
            ON verification.id = consumption.verificacao_id
           AND verification.empresa_id = consumption.empresa_id
         WHERE verification.equipamento_id = p_equipment_id
           AND consumption.empresa_id = v_tenant_id
           AND consumption.quantidade_aprovada > consumption.quantidade_baixada
         ORDER BY consumption.produto_id, consumption.servico_id
         FOR UPDATE OF consumption
    LOOP
        SELECT greatest(coalesce(product.quantidade_estoque, 0), 0)
          INTO v_available
          FROM public.produtos AS product
         WHERE product.id = v_pending.produto_id
           AND product.empresa_id = v_tenant_id
         FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'A pending product is unavailable for the active company' USING ERRCODE = 'P0002';
        END IF;
        v_debit := least(v_available, v_pending.restante);
        IF v_debit > 0 THEN
            UPDATE public.produtos AS product
               SET quantidade_estoque = coalesce(product.quantidade_estoque, 0) - v_debit,
                   atualizado_em = clock_timestamp()
             WHERE product.id = v_pending.produto_id AND product.empresa_id = v_tenant_id;
            INSERT INTO public.movimentacoes_estoque (
                empresa_id, produto_id, tipo, quantidade, origem, referencia, usuario, data_hora
            ) VALUES (
                v_tenant_id, v_pending.produto_id, 'SAIDA', v_debit, 'MANUTENCAO',
                'verificacao:' || v_pending.verificacao_id::text || ';servico:' || v_pending.servico_id,
                v_actor, clock_timestamp()
            );
            UPDATE public.orcamento_consumos AS consumption
               SET quantidade_baixada = consumption.quantidade_baixada + v_debit
             WHERE consumption.verificacao_id = v_pending.verificacao_id
               AND consumption.servico_id = v_pending.servico_id
               AND consumption.produto_id = v_pending.produto_id
               AND consumption.empresa_id = v_tenant_id;
            v_total := v_total + v_debit;
        END IF;
    END LOOP;
    RETURN v_total;
END;
$$;

ALTER FUNCTION public.saas_list_equipment_quote_consumption(uuid) OWNER TO postgres;
ALTER FUNCTION public.saas_consume_pending_equipment_parts(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_list_equipment_quote_consumption(uuid) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.saas_consume_pending_equipment_parts(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.saas_list_equipment_quote_consumption(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.saas_consume_pending_equipment_parts(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.saas_register_counter_intake_verification(
    p_equipment_id uuid,
    p_technician text,
    p_reported_problem text,
    p_diagnosis text,
    p_observations text
)
RETURNS public.verificacoes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tenant_id uuid := (SELECT public.current_company_id());
    v_equipment public.equipamentos%ROWTYPE;
    v_verification public.verificacoes%ROWTYPE;
BEGIN
    IF (SELECT auth.uid()) IS NULL OR v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Active SaaS identity is required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM private.current_saas_session_identity() AS identity
          JOIN public.security_profiles AS profile
            ON profile.id = identity.profile_id
           AND profile.empresa_id = identity.empresa_id
           AND profile.ativo IS TRUE
         WHERE identity.auth_user_id = (SELECT auth.uid())
           AND identity.empresa_id = v_tenant_id
    ) THEN
        RAISE EXCEPTION 'An active SaaS operational profile is required' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_technician), '') IS NULL OR NULLIF(btrim(p_reported_problem), '') IS NULL THEN
        RAISE EXCEPTION 'Technician and reported problem are required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_equipment
      FROM public.equipamentos AS equipment
     WHERE equipment.id = p_equipment_id AND equipment.empresa_id = v_tenant_id
     FOR UPDATE;
    IF NOT FOUND OR upper(coalesce(v_equipment.status, '')) <> 'RECEBIDO' THEN
        RAISE EXCEPTION 'Equipment is unavailable for intake verification' USING ERRCODE = '42501';
    END IF;

    -- Repeated requests after a network timeout reuse the initial verification.
    SELECT * INTO v_verification
      FROM public.verificacoes AS verification
     WHERE verification.equipamento_id = p_equipment_id
       AND verification.empresa_id = v_tenant_id
     ORDER BY verification.data_inicio DESC NULLS LAST, verification.id DESC
     LIMIT 1
     FOR UPDATE;
    IF FOUND THEN
        RETURN v_verification;
    END IF;

    INSERT INTO public.verificacoes (
        empresa_id, equipamento_id, tecnico_nome, problema_relatado, diagnostico,
        itens_verificados, servicos_necessarios, pecas_necessarias,
        custo_estimado_mao_obra, custo_estimado_pecas, custo_total,
        tempo_estimado, concluida, observacoes
    ) VALUES (
        v_tenant_id, p_equipment_id, btrim(p_technician), btrim(p_reported_problem),
        nullif(btrim(p_diagnosis), ''), '[]', '[]', '[]', NULL, NULL, NULL,
        NULL, false, nullif(btrim(p_observations), '')
    ) RETURNING * INTO v_verification;
    RETURN v_verification;
END;
$$;

ALTER FUNCTION public.saas_register_counter_intake_verification(uuid, text, text, text, text)
    OWNER TO postgres;
REVOKE ALL ON FUNCTION public.saas_register_counter_intake_verification(uuid, text, text, text, text)
    FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.saas_register_counter_intake_verification(uuid, text, text, text, text)
    TO authenticated;
