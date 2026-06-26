/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  types/index.ts — Definições Centrais de Tipos e Constantes ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Arquivo central de tipagem do projeto AutoOS.               ║
 * ║  TODAS as interfaces, enums e constantes ficam aqui.         ║
 * ║                                                              ║
 * ║  USADO POR (todos os arquivos do projeto):                   ║
 * ║  - src/lib/db.ts (tipagem dos métodos invoke)                ║
 * ║  - src/lib/validations.ts (schemas Zod usam os tipos)        ║
 * ║  - src/hooks/* (todos os hooks retornam esses tipos)         ║
 * ║  - src/pages/* (Equipamentos, Clientes, Insumos, Dashboard) ║
 * ║  - src/components/* (ClienteSelector, VerificacaoTecnica...) ║
 * ║  - src/lib/whatsapp-service.ts, email-service.ts             ║
 * ║                                                              ║
 * ║  ESPELHA as structs Rust em src-tauri/src/commands.rs        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

// ─── Status de Equipamento ──────────────────────────────
/**
 * Enum de 12 status do fluxo de manutenção.
 * Fluxo principal: RECEBIDO → EM_VERIFICACAO → VERIFICADO →
 *   AGUARDANDO_APROVACAO → APROVADO → EM_MANUTENCAO → PRONTO → ENTREGUE
 * Fluxos alternativos: REPROVADO, AGUARDANDO_PECA, ORCAMENTO_VENCIDO, ABANDONADO
 *
 * Conecta-se a: STATUS_LABELS, STATUS_COLORS, getProximosStatus() em Equipamentos.tsx
 */
export const STATUS_EQUIPAMENTO = {
  RECEBIDO: "RECEBIDO",
  EM_VERIFICACAO: "EM_VERIFICACAO",
  VERIFICADO: "VERIFICADO",
  AGUARDANDO_APROVACAO: "AGUARDANDO_APROVACAO",
  APROVADO: "APROVADO",
  REPROVADO: "REPROVADO",
  EM_MANUTENCAO: "EM_MANUTENCAO",
  AGUARDANDO_PECA: "AGUARDANDO_PECA",
  PRONTO: "PRONTO",
  ENTREGUE: "ENTREGUE",
  ORCAMENTO_VENCIDO: "ORCAMENTO_VENCIDO",
  ABANDONADO: "ABANDONADO",
} as const;

/** Tipo union de todos os valores de STATUS_EQUIPAMENTO */
export type StatusEquipamento = (typeof STATUS_EQUIPAMENTO)[keyof typeof STATUS_EQUIPAMENTO];

/** Rótulos legíveis em PT-BR para cada status. Usado em StatusBadge (Equipamentos.tsx, Clientes.tsx) */
export const STATUS_LABELS: Record<StatusEquipamento, string> = {
  RECEBIDO: "Recebido",
  EM_VERIFICACAO: "Em Verificação",
  VERIFICADO: "Verificado",
  AGUARDANDO_APROVACAO: "Aguardando Aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  EM_MANUTENCAO: "Em Manutenção",
  AGUARDANDO_PECA: "Aguardando Peça",
  PRONTO: "Pronto",
  ENTREGUE: "Entregue",
  ORCAMENTO_VENCIDO: "Orçamento Vencido",
  ABANDONADO: "Abandonado",
};

/** Classes CSS Tailwind de cor para cada status. Usado em StatusBadge (Equipamentos.tsx, Clientes.tsx) */
export const STATUS_COLORS: Record<StatusEquipamento, string> = {
  RECEBIDO: "bg-blue-100 text-blue-800",
  EM_VERIFICACAO: "bg-yellow-100 text-yellow-800",
  VERIFICADO: "bg-purple-100 text-purple-800",
  AGUARDANDO_APROVACAO: "bg-orange-100 text-orange-800",
  APROVADO: "bg-green-100 text-green-800",
  REPROVADO: "bg-red-100 text-red-800",
  EM_MANUTENCAO: "bg-indigo-100 text-indigo-800",
  AGUARDANDO_PECA: "bg-amber-100 text-amber-800",
  PRONTO: "bg-emerald-100 text-emerald-800",
  ENTREGUE: "bg-gray-100 text-gray-800",
  ORCAMENTO_VENCIDO: "bg-rose-100 text-rose-800",
  ABANDONADO: "bg-stone-100 text-stone-800",
};

// ─── Interfaces ─────────────────────────────────────────

/**
 * Equipamento em manutenção. Espelha a struct Rust `Equipamento` em commands.rs
 * e a tabela PostgreSQL `equipamentos` (migrações em src-tauri/migrations).
 *
 * Usado por: useEquipamentos hook, Equipamentos.tsx, ClienteSelector.tsx,
 *            WhatsAppService, EmailService, useStatusEquipamento
 */
export interface Equipamento {
  id?: number;
  serial_number: string;
  patrimonio?: string;
  marca: string;
  modelo: string;
  tipo: string;
  status: string;
  defeito_relatado?: string;
  acessorios?: string;
  acessorios_outros?: string;
  paginas_impressas?: number;
  tecnologia?: string;
  conectividade?: string;
  data_entrada: string;
  proprietario?: string;
  preco_compra?: number;
  preco_venda?: number;
  observacoes?: string;
  // Dados do cliente
  cliente_id?: number;
  cliente_nome?: string;
  cliente_telefone?: string;
  cliente_email?: string;
  // Controle de orçamento e datas
  prazo_aprovacao?: string;
  data_aprovacao?: string;
  data_reprovacao?: string;
  data_verificacao?: string;
  data_pronto?: string;
  data_saida?: string;
  valor_orcamento?: number;
  valor_final?: number;
  // Auditoria
  criado_em?: string;
  atualizado_em?: string;
}

export const CATEGORIAS_IMAGEM_EQUIPAMENTO = {
  ENTRADA: "ENTRADA",
  SAIDA: "SAIDA",
  VERIFICACAO: "VERIFICACAO",
} as const;

export type EquipamentoImagemCategoria =
  (typeof CATEGORIAS_IMAGEM_EQUIPAMENTO)[keyof typeof CATEGORIAS_IMAGEM_EQUIPAMENTO];

export interface EquipamentoImagem {
  id?: number;
  equipamento_id: number;
  categoria: EquipamentoImagemCategoria;
  filename: string;
  mime_type: string;
  tamanho_bytes: number;
  largura?: number;
  altura?: number;
  ordem: number;
  observacao?: string;
  bytes: number[];
  criado_em?: string;
  atualizado_em?: string;
}

export interface EquipamentoImagemInput {
  categoria: EquipamentoImagemCategoria;
  filename: string;
  mime_type: string;
  tamanho_bytes: number;
  largura?: number;
  altura?: number;
  ordem: number;
  observacao?: string;
  bytes: number[];
}

/**
 * Cliente (Pessoa Física ou Jurídica). Espelha a struct Rust `Cliente` em commands.rs
 * e a tabela PostgreSQL `clientes` (migrações em src-tauri/migrations).
 *
 * - PF: campos `nome`, `documento` (CPF)
 * - PJ: campos `razao_social`, `nome_fantasia`, `documento` (CNPJ)
 *
 * Usado por: useClientes hook, Clientes.tsx, ClienteSelector.tsx, Equipamentos.tsx
 */
export interface Cliente {
  id?: number;
  nome?: string;
  tipo_pessoa?: string;        // PF ou PJ
  documento?: string;          // CPF ou CNPJ (sem máscara)
  razao_social?: string;       // PJ
  nome_fantasia?: string;      // PJ
  inscricao_estadual?: string; // PJ
  cpf_cnpj?: string;           // mantido para retrocompatibilidade
  telefone: string;
  telefone_secundario?: string;
  email?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  receber_email?: boolean;
  receber_whatsapp?: boolean;
  observacoes?: string;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

/**
 * Produto de estoque (insumos: toners, peças, etc).
 * Espelha a struct Rust `Produto` em commands.rs e a tabela `produtos`.
 *
 * Usado por: useInsumos hook, Insumos.tsx
 */
export interface Produto {
  id?: number;
  codigo: string;
  nome: string;
  descricao?: string;
  categoria: string;
  quantidade_estoque: number;
  quantidade_minima: number;
  preco_custo: number;
  preco_venda: number;
  localizacao?: string;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

/** Serviço padrão do catálogo para orçamento/verificação técnica. */
export interface ServicoCatalogo {
  id?: number;
  nome: string;
  descricao?: string;
  preco_padrao: number;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

/**
 * Movimentação de entrada/saída de estoque.
 * Espelha a tabela `movimentacoes_estoque` em db.rs.
 *
 * Usado por: useInsumos hook (registrarMovimentacao), Insumos.tsx
 */
export interface MovimentacaoEstoque {
  id?: number;
  produto_id: number;
  tipo: "ENTRADA" | "SAIDA";
  quantidade: number;
  origem: "COMPRA" | "VENDA" | "MANUTENCAO" | "AJUSTE" | "PERDA" | "DEVOLUCAO";
  referencia?: string;
  data_hora: string;
  usuario?: string;
  observacoes?: string;
  valor_unitario?: number;
  valor_total?: number;
}

// ─── Verificação Técnica ────────────────────────────────

/** Item individual do checklist de verificação técnica (ex: "Teste de impressão") */
export interface ItemVerificacao {
  id: string;
  nome: string;
  verificado: boolean;
  observacao?: string;
}

/** Serviço necessário identificado na verificação (ex: "Limpeza cabeça térmica") */
export interface ServicoNecessario {
  id: string;
  catalogo_id?: number;
  descricao: string;
  valor: number;
}

/** Peça necessária para reparo (ex: "Cabeça de impressão", qtd: 1, R$ 350) */
export interface PecaNecessaria {
  id: string;
  nome: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

/**
 * Resultado completo da verificação técnica de um equipamento.
 * Espelha a struct Rust `Verificacao` e tabela `verificacoes`.
 * Os campos itens_verificados, servicos_necessarios e pecas_necessarias
 * são JSON strings de ItemVerificacao[], ServicoNecessario[] e PecaNecessaria[].
 *
 * Usado por: VerificacaoTecnica.tsx, useStatusEquipamento, WhatsAppService, EmailService
 */
export interface Verificacao {
  id?: number;
  equipamento_id: number;
  tecnico_nome: string;
  data_inicio?: string;
  data_fim?: string;
  problema_relatado: string;
  diagnostico?: string;
  itens_verificados?: string;       // JSON string of ItemVerificacao[]
  servicos_necessarios?: string;    // JSON string of ServicoNecessario[]
  pecas_necessarias?: string;       // JSON string of PecaNecessaria[]
  custo_estimado_mao_obra?: number;
  custo_estimado_pecas?: number;
  custo_total?: number;
  tempo_estimado?: number;
  concluida?: boolean;
  observacoes?: string;
}

// ─── Comunicações ───────────────────────────────────────

/**
 * Registro de comunicação (email/WhatsApp) enviada ao cliente.
 * Espelha a struct Rust `Comunicacao` e tabela `comunicacoes`.
 *
 * tipo: ORCAMENTO | PRONTO | LEMBRETE | MANUAL
 * canal: EMAIL | WHATSAPP
 *
 * Usado por: HistoricoComunicacoes.tsx, WhatsAppService, EmailService
 */
export interface Comunicacao {
  id?: number;
  equipamento_id: number;
  tipo: string;    // ORCAMENTO, PRONTO, LEMBRETE, MANUAL
  canal: string;   // EMAIL, WHATSAPP
  destinatario: string;
  contato: string;
  assunto?: string;
  mensagem: string;
  anexos?: string;
  enviado?: boolean;
  data_envio?: string;
  erro?: string;
  criado_em?: string;
}

// ─── SMTP ──────────────────────────────────────────────

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  from_name: string;
  from_email: string;
  use_tls: boolean;
  has_password?: boolean;
}

export interface SmtpConfigInput extends SmtpConfig {
  password?: string;
}

export const WHATSAPP_PROVIDERS = {
  EVOLUTION: "EVOLUTION",
} as const;

export type WhatsappProvider = (typeof WHATSAPP_PROVIDERS)[keyof typeof WHATSAPP_PROVIDERS];

export interface WhatsappConfig {
  provider: WhatsappProvider;
  api_url: string;
  has_token?: boolean;
}

export interface WhatsappConfigInput extends WhatsappConfig {
  token?: string;
}

export interface EmailAttachment {
  filename: string;
  content_type?: string;
  bytes?: number[];
  path?: string;
}

export interface EmailSendRequest {
  destinatario: string;
  email: string;
  cc?: string[];
  assunto: string;
  corpo: string;
  corpo_texto?: string;
  corpo_html?: string;
  anexos?: EmailAttachment[];
}

export interface WhatsappSendRequest {
  contato: string;
  mensagem: string;
}

export interface ResultadoAutomacao {
  sucesso: boolean;
  erro?: string;
  mensagem?: string;
  canais?: {
    whatsapp?: { enviado: boolean; erro?: string };
    email?: { enviado: boolean; erro?: string };
  };
}

export const SENSITIVE_PERMISSIONS = {
  CONFIG_SMTP: "CONFIG_SMTP",
  CONFIG_WHATSAPP: "CONFIG_WHATSAPP",
  DELETE_RECORDS: "DELETE_RECORDS",
  FINANCIAL_ACTIONS: "FINANCIAL_ACTIONS",
  STOCK_CONTROL: "STOCK_CONTROL",
  MANAGE_PROFILES: "MANAGE_PROFILES",
  VIEW_EXPENSES: "VIEW_EXPENSES",
} as const;

export type SensitivePermission = (typeof SENSITIVE_PERMISSIONS)[keyof typeof SENSITIVE_PERMISSIONS];

export const SENSITIVE_PERMISSION_LABELS: Record<SensitivePermission, string> = {
  CONFIG_SMTP: "configurar SMTP e envios de email",
  CONFIG_WHATSAPP: "configurar API de WhatsApp",
  DELETE_RECORDS: "excluir registros",
  FINANCIAL_ACTIONS: "alterar orçamentos, aprovações e valores",
  STOCK_CONTROL: "movimentar e editar estoque",
  MANAGE_PROFILES: "gerenciar perfis e auditoria",
  VIEW_EXPENSES: "visualizar gastos e despesas",
};

export interface SecurityProfile {
  id: number;
  nome: string;
  role: string;
  permissions: SensitivePermission[];
  pin_configured: boolean;
  is_default: boolean;
  ativo: boolean;
}

export interface SecurityProfileInput {
  nome: string;
  role: string;
  permissions: SensitivePermission[];
}

export interface SecurityAuditEvent {
  id: number;
  event_type: string;
  profile_id?: number | null;
  profile_name?: string | null;
  details?: string | null;
  success: boolean;
  created_at?: string | null;
}

export interface SensitiveAccessStatus {
  pin_configured: boolean;
  unlocked: boolean;
  expires_at?: string | null;
  active_profile_id?: number | null;
  active_profile_name?: string | null;
  active_role?: string | null;
  permissions: SensitivePermission[];
  can_manage_profiles: boolean;
  profiles: SecurityProfile[];
}

export interface DatabaseMigrationStatus {
  version: number;
  description: string;
  installed_on?: string | null;
  success: boolean;
  applied: boolean;
}

export interface DatabaseSchemaStatus {
  database_name: string;
  schema_name: string;
  latest_known_version?: number | null;
  latest_applied_version?: number | null;
  applied_count: number;
  known_count: number;
  pending_count: number;
  migrations: DatabaseMigrationStatus[];
}

export interface PostgresBackupToolsStatus {
  database_name: string;
  host?: string | null;
  port?: number | null;
  backup_directory: string;
  pg_dump_available: boolean;
  pg_restore_available: boolean;
  psql_available: boolean;
}

export interface PostgresBackupResult {
  file_name: string;
  file_path: string;
  created_at: string;
}

export interface PostgresRestoreResult {
  file_path: string;
  restored_with: string;
  restored_at: string;
}

export interface SupportFileSummary {
  file_name: string;
  file_path: string;
  size_bytes: number;
  modified_at?: string | null;
}

export interface LocalHousekeepingStatus {
  temp_files_removed: number;
  log_files_removed: number;
  support_files_removed: number;
}

export interface WindowsBundleReadiness {
  product_name: string;
  version: string;
  identifier: string;
  targets: string;
  has_certificate_thumbprint: boolean;
  has_timestamp_url: boolean;
  icon_count: number;
  blockers: string[];
}

export interface LocalSupportStatus {
  product_name: string;
  app_version: string;
  app_identifier: string;
  target_os: string;
  build_profile: string;
  log_directory: string;
  support_directory: string;
  temp_directory: string;
  backup_directory: string;
  capability_permissions: string[];
  capability_review: string;
  recent_log_files: SupportFileSummary[];
  recent_support_files: SupportFileSummary[];
  recent_temp_files: SupportFileSummary[];
  schema_status?: DatabaseSchemaStatus | null;
  schema_error?: string | null;
  backup_tools_status?: PostgresBackupToolsStatus | null;
  backup_tools_error?: string | null;
  windows_bundle: WindowsBundleReadiness;
  housekeeping: LocalHousekeepingStatus;
}

export interface LocalSupportBundleResult {
  file_name: string;
  file_path: string;
  created_at: string;
}

// ─── Gastos Fixos e Variáveis ───────────────────────────

/**
 * Categorias válidas para gastos fixos e variáveis.
 * Espelha os nomes seedados em gastos_fixos na migration 0006.
 */
export type GastosFixosCategoria =
  | 'Aluguel'
  | 'Energia'
  | 'Internet'
  | 'Fornecedores'
  | 'Folha'
  | 'Outros';

/**
 * Gasto fixo (despesa recorrente). Espelha a struct Rust `GastoFixoRow`
 * e a tabela PostgreSQL `gastos_fixos` (migration 0006).
 */
export interface GastoFixo {
  id?: number;
  nome: string;
  valor: number;
  vencimento_dia?: number;
  categoria: GastosFixosCategoria;
  ativo?: boolean;
  criado_em?: string;
  atualizado_em?: string;
}

/**
 * Gasto variável (despesa avulsa). Espelha a struct Rust `GastoVariavelRow`
 * e a tabela PostgreSQL `gastos_variaveis` (migration 0006).
 */
export interface GastoVariavel {
  id?: number;
  descricao: string;
  valor: number;
  data: string;
  categoria: GastosFixosCategoria;
  nota?: string;
  referencia_id?: number;
  criado_em?: string;
  atualizado_em?: string;
}

/**
 * Input para criar gasto variável.
 * Espelha a struct Rust `GastoVariavelInput`.
 */
export interface GastoVariavelInput {
  descricao: string;
  valor: number;
  data: string;
  categoria: GastosFixosCategoria;
  nota?: string;
  referencia_id?: number;
}

/**
 * Valor agregado por categoria (usado no resumo mensal).
 * Espelha a struct Rust `CategoriaValor`.
 */
export interface CategoriaValor {
  categoria: string;
  valor: number;
}

/**
 * Resumo mensal de gastos (fixos + variáveis + por categoria).
 * Espelha a struct Rust `GastoResumoMensal`.
 */
export interface GastoResumoMensal {
  total_fixo: number;
  total_variavel: number;
  total_geral: number;
  por_categoria: CategoriaValor[];
}

// ─── Checklist padrão ───────────────────────────────────

/**
 * Checklist padrão de 7 itens para verificação técnica de impressoras.
 * Usado em VerificacaoTecnica.tsx para inicializar o formulário.
 */
export const CHECKLIST_PADRAO: ItemVerificacao[] = [
  { id: "1", nome: "Teste de impressão", verificado: false },
  { id: "2", nome: "Verificação de cabeça de impressão", verificado: false },
  { id: "3", nome: "Teste de conectividade (USB/WiFi)", verificado: false },
  { id: "4", nome: "Verificação de alimentação de papel", verificado: false },
  { id: "5", nome: "Limpeza interna", verificado: false },
  { id: "6", nome: "Verificação de cartuchos/toner", verificado: false },
  { id: "7", nome: "Teste de scanner (se multifuncional)", verificado: false },
];

export interface DatabaseConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

/** Configuração de bloqueio por inatividade. Espelha a struct/config do backend. */
export interface ConfigInatividade {
  inactivity_lock_enabled: boolean;
}

/** Resultado da verificação de credenciais do banco de dados. */
export interface ResultadoVerificacaoCredenciais {
  success: boolean;
  error?: string;
}

/**
 * Input para ajuste de orçamento/serviços de verificação técnica.
 * Espelha os parâmetros do comando Rust `atualizar_servicos_verificacao`.
 * Os arrays servicos/pecas são serializados como JSON strings no invoke wrapper.
 */
export interface AjusteOrcamentoInput {
  equipamento_id: number;
  servicos: ServicoNecessario[];
  pecas: PecaNecessaria[];
  custo_total: number;
}
