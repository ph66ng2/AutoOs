/** Mock com dados de demonstração: Contatos, Alterar Orçamento e PDF. */

export class Resource {}
export class Channel<T> {
  onmessage: ((message: T) => void) | null = null;
}

export function isTauri(): boolean {
  return false;
}

const agora = "2026-09-17T15:00:00Z";

const status = {
  pin_configured: true,
  unlocked: true,
  expires_at: null,
  active_profile_id: 1,
  active_profile_name: "Atendente BMITAG",
  active_role: "ATENDENTE",
  permissions: ["FINANCIAL_ACTIONS", "VIEW_EXPENSES"],
  can_manage_profiles: false,
  profiles: [],
};

const cliente = {
  id: 11,
  empresa_id: 7,
  tipo_pessoa: "PJ",
  nome: "BMITAG Identificação",
  razao_social: "BMITAG Identificação Ltda",
  nome_fantasia: "BMITAG",
  documento: "12345678000199",
  cpf_cnpj: "12345678000199",
  telefone: "7133334444",
  email: "contato@bmitag.com.br",
  cidade: "Salvador",
  uf: "BA",
  ativo: true,
  criado_em: agora,
  atualizado_em: agora,
};

let proximoContatoId = 22;
const contatos = [
  {
    id: 21,
    empresa_id: 7,
    cliente_id: 11,
    nome: "Ana Souza",
    email: "ana.souza@bmitag.com.br",
    telefone: "71988887777",
    ativo: true,
    criado_em: agora,
    atualizado_em: agora,
  },
];

const equipamento = {
  id: 10,
  empresa_id: 7,
  serial_number: "ZD620-8841",
  patrimonio: "PAT-441",
  marca: "Zebra",
  modelo: "ZD620",
  tipo: "Impressora de Código de Barra",
  status: "EM_MANUTENCAO",
  defeito_relatado: "Não imprime etiquetas",
  data_entrada: "2026-09-10",
  cliente_id: 11,
  cliente_nome: "BMITAG",
  cliente_telefone: "7133334444",
  cliente_email: "contato@bmitag.com.br",
  responsavel_contato_id: 21,
  responsavel_nome: "Ana Souza",
  responsavel_email: "ana.souza@bmitag.com.br",
  responsavel_telefone: "71988887777",
  valor_orcamento: 0,
  prazo_aprovacao: "2026-09-20",
  atualizado_em: agora,
};

let verificacao = {
  id: 100,
  equipamento_id: 10,
  empresa_id: 7,
  tecnico_nome: "Ivan",
  problema_relatado: "Não imprime etiquetas",
  diagnostico: "Firmware desatualizado e sensor de gap descalibrado.",
  servicos_necessarios: JSON.stringify([
    { id: "s1", descricao: "Atualização do Firmware", valor: 120 },
  ]),
  pecas_necessarias: "[]",
  custo_total: 0,
  tempo_estimado: 4,
  concluida: true,
  observacoes: "Cliente pediu retorno rápido.",
  adjusted_at: null,
};

const catalogo = [
  { id: 1, nome: "Atualização do Firmware", preco_padrao: 120, ativo: true },
  { id: 2, nome: "Calibração de sensor", preco_padrao: 80, ativo: true },
  { id: 3, nome: "Limpeza preventiva", preco_padrao: 60, ativo: true },
];

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case "verificar_status_banco":
      return true as T;
    case "get_sensitive_access_status":
    case "set_active_security_profile":
    case "unlock_sensitive_access":
      return status as T;
    case "lock_sensitive_access":
      return true as T;
    case "verificar_config_inatividade":
      return false as T;
    case "listar_clientes":
      return [cliente] as T;
    case "buscar_cliente":
      return cliente as T;
    case "listar_equipamentos": {
      const statusFiltro = args?.status as string | undefined;
      if (statusFiltro && statusFiltro !== "TODOS" && equipamento.status !== statusFiltro) {
        return [] as T;
      }
      return [equipamento] as T;
    }
    case "buscar_equipamento":
      return equipamento as T;
    case "buscar_equipamentos_por_serial":
      return [equipamento] as T;
    case "listar_cliente_contatos":
      return contatos.filter((c) => c.ativo) as T;
    case "criar_cliente_contato": {
      const input = (args?.input ?? args ?? {}) as Record<string, string | number>;
      const novo = {
        id: proximoContatoId++,
        empresa_id: Number(input.empresa_id ?? 7),
        cliente_id: Number(input.cliente_id ?? 11),
        nome: String(input.nome ?? "Contato"),
        email: input.email ? String(input.email) : undefined,
        telefone: input.telefone ? String(input.telefone) : undefined,
        ativo: true,
        criado_em: agora,
        atualizado_em: agora,
      };
      contatos.push(novo);
      return novo as T;
    }
    case "atualizar_cliente_contato": {
      const id = Number(args?.id ?? 0);
      const input = (args?.input ?? args ?? {}) as Record<string, string | number>;
      const idx = contatos.findIndex((c) => c.id === id);
      if (idx < 0) throw new Error("Contato não encontrado");
      contatos[idx] = {
        ...contatos[idx],
        nome: String(input.nome ?? contatos[idx].nome),
        email: input.email ? String(input.email) : contatos[idx].email,
        telefone: input.telefone ? String(input.telefone) : contatos[idx].telefone,
        atualizado_em: agora,
      };
      return contatos[idx] as T;
    }
    case "buscar_verificacao_tecnica":
      return verificacao as T;
    case "listar_servicos_catalogo_ativos":
      return catalogo as T;
    case "atualizar_servicos_verificacao": {
      const custo = Number(args?.custoTotal ?? 120);
      equipamento.valor_orcamento = custo;
      verificacao = {
        ...verificacao,
        custo_total: custo,
        servicos_necessarios: String(args?.servicosJson ?? verificacao.servicos_necessarios),
        adjusted_at: agora,
      };
      return verificacao as T;
    }
    case "listar_produtos":
    case "listar_imagens_equipamento":
    case "listar_historico_equipamento":
    case "listar_comunicacoes":
    case "list_security_profiles":
      return [] as T;
    case "carregar_config_banco":
    case "obter_config_banco_atual":
    case "obter_erro_inicializacao_banco":
      return null as T;
    default:
      return undefined as T;
  }
}
