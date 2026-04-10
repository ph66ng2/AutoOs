CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nome TEXT,
    tipo_pessoa TEXT DEFAULT 'PF',
    documento TEXT UNIQUE,
    razao_social TEXT,
    nome_fantasia TEXT,
    inscricao_estadual TEXT,
    cpf_cnpj TEXT UNIQUE,
    telefone TEXT NOT NULL,
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
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS equipamentos (
    id SERIAL PRIMARY KEY,
    serial_number TEXT UNIQUE NOT NULL,
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
    cliente_id INTEGER,
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
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_equipamentos_cliente
        FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS produtos (
    id SERIAL PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
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
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id SERIAL PRIMARY KEY,
    produto_id INTEGER NOT NULL,
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
        FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verificacoes (
    id SERIAL PRIMARY KEY,
    equipamento_id INTEGER NOT NULL,
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
    CONSTRAINT fk_verificacoes_equipamento
        FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS comunicacoes (
    id SERIAL PRIMARY KEY,
    equipamento_id INTEGER NOT NULL,
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
        FOREIGN KEY (equipamento_id) REFERENCES equipamentos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS security_profiles (
    id SERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL,
    permissions TEXT NOT NULL,
    ativo BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS security_audit_log (
    id SERIAL PRIMARY KEY,
    event_type TEXT NOT NULL,
    profile_id INTEGER,
    profile_name TEXT,
    details TEXT,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_profile
        FOREIGN KEY (profile_id) REFERENCES security_profiles(id) ON DELETE SET NULL
);

INSERT INTO security_profiles (nome, role, permissions, is_default)
SELECT 'Administrador Local', 'ADMIN', '["CONFIG_SMTP","DELETE_RECORDS","FINANCIAL_ACTIONS","STOCK_CONTROL","MANAGE_PROFILES"]', true
WHERE NOT EXISTS (SELECT 1 FROM security_profiles);