import { Schema, Table, column } from "@powersync/web";

/**
 * PowerSync Schema para AutoOS.
 *
 * Mapeamento de tipos do PostgreSQL → SQLite:
 * - uuid / TEXT / VARCHAR / TIMESTAMP / DATE → column.text
 * - INTEGER / BOOLEAN → column.integer
 * - NUMERIC / DECIMAL → column.real
 *
 * Regras especiais:
 * - security_audit_log: insertOnly (upload-only)
 * - equipamento_imagens: sem coluna bytes (apenas storage_path)
 */

export const clientes = new Table(
  {
    empresa_id: column.text,
    nome: column.text,
    tipo_pessoa: column.text,
    documento: column.text,
    razao_social: column.text,
    nome_fantasia: column.text,
    inscricao_estadual: column.text,
    cpf_cnpj: column.text,
    telefone: column.text,
    telefone_secundario: column.text,
    email: column.text,
    cep: column.text,
    endereco: column.text,
    numero: column.text,
    complemento: column.text,
    bairro: column.text,
    cidade: column.text,
    uf: column.text,
    receber_email: column.integer,
    receber_whatsapp: column.integer,
    observacoes: column.text,
    ativo: column.integer,
    criado_em: column.text,
    atualizado_em: column.text,
  },
  { indexes: { idx_clientes_empresa: ["empresa_id"] } }
);

export const equipamentos = new Table(
  {
    empresa_id: column.text,
    serial_number: column.text,
    patrimonio: column.text,
    marca: column.text,
    modelo: column.text,
    tipo: column.text,
    status: column.text,
    paginas_impressas: column.integer,
    tecnologia: column.text,
    conectividade: column.text,
    data_entrada: column.text,
    proprietario: column.text,
    preco_compra: column.real,
    preco_venda: column.real,
    observacoes: column.text,
    cliente_id: column.text,
    cliente_nome: column.text,
    cliente_telefone: column.text,
    cliente_email: column.text,
    prazo_aprovacao: column.text,
    data_aprovacao: column.text,
    data_reprovacao: column.text,
    data_verificacao: column.text,
    data_pronto: column.text,
    data_saida: column.text,
    valor_orcamento: column.real,
    valor_final: column.real,
    defeito_relatado: column.text,
    acessorios: column.text,
    acessorios_outros: column.text,
    criado_em: column.text,
    atualizado_em: column.text,
  },
  { indexes: { idx_equipamentos_empresa: ["empresa_id"] } }
);

export const produtos = new Table(
  {
    empresa_id: column.text,
    codigo: column.text,
    nome: column.text,
    descricao: column.text,
    categoria: column.text,
    quantidade_estoque: column.integer,
    quantidade_minima: column.integer,
    quantidade_maxima: column.integer,
    unidade_medida: column.text,
    localizacao: column.text,
    preco_custo: column.real,
    preco_venda: column.real,
    margem_lucro: column.real,
    marca_original: column.text,
    tipo_cartucho: column.text,
    cor: column.text,
    rendimento: column.integer,
    modelos_compativeis: column.text,
    fornecedor_principal: column.text,
    prazo_entrega: column.integer,
    ativo: column.integer,
    criado_em: column.text,
    atualizado_em: column.text,
  },
  { indexes: { idx_produtos_empresa: ["empresa_id"] } }
);

export const movimentacoes_estoque = new Table(
  {
    empresa_id: column.text,
    produto_id: column.text,
    tipo: column.text,
    quantidade: column.integer,
    origem: column.text,
    referencia: column.text,
    data_hora: column.text,
    usuario: column.text,
    observacoes: column.text,
    valor_unitario: column.real,
    valor_total: column.real,
  },
  { indexes: { idx_movimentacoes_empresa: ["empresa_id"] } }
);

export const security_profiles = new Table(
  {
    empresa_id: column.text,
    nome: column.text,
    role: column.text,
    permissions: column.text,
    ativo: column.integer,
    is_default: column.integer,
    criado_em: column.text,
    atualizado_em: column.text,
  },
  { indexes: { idx_security_profiles_empresa: ["empresa_id"] } }
);

export const verificacoes = new Table(
  {
    empresa_id: column.text,
    equipamento_id: column.text,
    tecnico_nome: column.text,
    data_inicio: column.text,
    data_fim: column.text,
    problema_relatado: column.text,
    diagnostico: column.text,
    itens_verificados: column.text,
    servicos_necessarios: column.text,
    pecas_necessarias: column.text,
    custo_estimado_mao_obra: column.real,
    custo_estimado_pecas: column.real,
    custo_total: column.real,
    tempo_estimado: column.integer,
    concluida: column.integer,
    observacoes: column.text,
    adjusted_at: column.text,
    adjusted_by_profile_id: column.text,
  },
  { indexes: { idx_verificacoes_empresa: ["empresa_id"] } }
);

export const comunicacoes = new Table(
  {
    empresa_id: column.text,
    equipamento_id: column.text,
    tipo: column.text,
    canal: column.text,
    destinatario: column.text,
    contato: column.text,
    assunto: column.text,
    mensagem: column.text,
    anexos: column.text,
    enviado: column.integer,
    data_envio: column.text,
    erro: column.text,
    criado_em: column.text,
  },
  { indexes: { idx_comunicacoes_empresa: ["empresa_id"] } }
);

export const security_audit_log = Table.createInsertOnly(
  {
    empresa_id: column.text,
    event_type: column.text,
    profile_id: column.text,
    profile_name: column.text,
    details: column.text,
    success: column.integer,
    created_at: column.text,
  },
  { indexes: { idx_audit_empresa: ["empresa_id"] } }
);

export const equipamento_imagens = new Table(
  {
    empresa_id: column.text,
    equipamento_id: column.text,
    categoria: column.text,
    filename: column.text,
    mime_type: column.text,
    tamanho_bytes: column.integer,
    largura: column.integer,
    altura: column.integer,
    ordem: column.integer,
    observacao: column.text,
    storage_path: column.text,
    criado_em: column.text,
    atualizado_em: column.text,
  },
  { indexes: { idx_imagens_empresa: ["empresa_id"] } }
);

export const servicos_catalogo = new Table(
  {
    empresa_id: column.text,
    nome: column.text,
    descricao: column.text,
    preco_padrao: column.real,
    ativo: column.integer,
    criado_em: column.text,
    atualizado_em: column.text,
  },
  { indexes: { idx_servicos_empresa: ["empresa_id"] } }
);

export const gastos_fixos = new Table(
  {
    empresa_id: column.text,
    nome: column.text,
    valor: column.real,
    vencimento_dia: column.integer,
    categoria: column.text,
    ativo: column.integer,
    criado_em: column.text,
    atualizado_em: column.text,
  },
  { indexes: { idx_gastos_fixos_empresa: ["empresa_id"] } }
);

export const gastos_variaveis = new Table(
  {
    empresa_id: column.text,
    descricao: column.text,
    valor: column.real,
    data: column.text,
    categoria: column.text,
    nota: column.text,
    referencia_id: column.text,
    criado_em: column.text,
    atualizado_em: column.text,
  },
  { indexes: { idx_gastos_variaveis_empresa: ["empresa_id"] } }
);

export const configuracoes_sistema = new Table(
  {
    empresa_id: column.text,
    inactivity_lock_enabled: column.integer,
    updated_at: column.text,
  },
  { indexes: { idx_config_empresa: ["empresa_id"] } }
);

export const AppSchema = new Schema({
  clientes,
  equipamentos,
  produtos,
  movimentacoes_estoque,
  security_profiles,
  verificacoes,
  comunicacoes,
  security_audit_log,
  equipamento_imagens,
  servicos_catalogo,
  gastos_fixos,
  gastos_variaveis,
  configuracoes_sistema,
});

export type ClienteRow = typeof AppSchema.types.clientes;
export type EquipamentoRow = typeof AppSchema.types.equipamentos;
export type ProdutoRow = typeof AppSchema.types.produtos;
export type MovimentacaoEstoqueRow = typeof AppSchema.types.movimentacoes_estoque;
export type SecurityProfileRow = typeof AppSchema.types.security_profiles;
export type VerificacaoRow = typeof AppSchema.types.verificacoes;
export type ComunicacaoRow = typeof AppSchema.types.comunicacoes;
export type SecurityAuditLogRow = typeof AppSchema.types.security_audit_log;
export type EquipamentoImagemRow = typeof AppSchema.types.equipamento_imagens;
export type ServicoCatalogoRow = typeof AppSchema.types.servicos_catalogo;
export type GastoFixoRow = typeof AppSchema.types.gastos_fixos;
export type GastoVariavelRow = typeof AppSchema.types.gastos_variaveis;
export type ConfiguracoesSistemaRow = typeof AppSchema.types.configuracoes_sistema;
