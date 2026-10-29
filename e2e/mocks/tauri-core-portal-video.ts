/**
 * Mock do vídeo tutorial do operador (lado desktop do Portal do Cliente).
 * Só para a gravação em navegador com VITE_E2E_PORTAL_VIDEO=1; nunca entra no build de produção.
 * Todos os dados são fictícios. O estado fica em memória e muda a cada ação da tela.
 *
 * O roteiro de gravação conduz o "lado do cliente" por `window.__portalVideo`
 * (cliente aceita, prazo de correção passa, cliente negocia, etc.).
 */
import { SENSITIVE_PERMISSIONS } from "../../src/types";

export class Resource {}
export class Channel<T> {
  onmessage: ((message: T) => void) | null = null;
}

export function isTauri(): boolean {
  return false;
}

const MINUTO = 60_000;
const DIA = 24 * 60 * MINUTO;
const iso = (ms: number) => new Date(ms).toISOString();
const horaCurta = (ms: number) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(ms));
const dataIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const inicio = Date.now();

/* ─── Perfil: administrador com permissões financeiras, já desbloqueado ─── */
const permissoes = [
  SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
  SENSITIVE_PERMISSIONS.PREPARE_QUOTES,
  SENSITIVE_PERMISSIONS.MANAGE_STATUS_LINKS,
];
const perfil = {
  id: 1,
  nome: "Administrador (demonstração)",
  role: "ADMIN",
  permissions: permissoes,
  pin_configured: true,
  pin_required: true,
  is_default: true,
  ativo: true,
  tour_permissoes_vistas: permissoes,
  onboarding_pendente: false,
};
const statusAcesso = {
  pin_configured: true,
  unlocked: true,
  expires_at: null,
  active_profile_id: 1,
  active_profile_name: perfil.nome,
  active_role: "ADMIN",
  permissions: permissoes,
  can_manage_profiles: false,
  // Sem lista de perfis: o seletor de PIN de abertura não aparece na gravação.
  profiles: [],
};

/* ─── Cliente e contatos ─── */
const cliente = {
  id: 11,
  empresa_id: 7,
  tipo_pessoa: "PJ",
  nome: "Gráfica Exemplo Ltda",
  razao_social: "Gráfica Exemplo Ltda",
  nome_fantasia: "Gráfica Exemplo",
  documento: "11222333000181",
  cpf_cnpj: "11222333000181",
  telefone: "7130000000",
  email: "contato@graficaexemplo.example",
  cidade: "Salvador",
  uf: "BA",
  ativo: true,
  criado_em: iso(inicio - 90 * DIA),
  atualizado_em: iso(inicio - 90 * DIA),
};

type Contato = {
  id: number;
  empresa_id: number;
  cliente_id: number;
  nome: string;
  email?: string;
  telefone?: string;
  ativo: boolean;
  portal_acesso: "NENHUM" | "ACOMPANHAR" | "DECIDIR";
  portal_senha_definida_em: string | null;
  criado_em: string;
  atualizado_em: string;
};

const contatos: Contato[] = [
  {
    id: 21, empresa_id: 7, cliente_id: 11, nome: "Marina Alves",
    email: "marina@graficaexemplo.example", telefone: "71900001111", ativo: true,
    portal_acesso: "NENHUM", portal_senha_definida_em: null,
    criado_em: iso(inicio - 80 * DIA), atualizado_em: iso(inicio - 80 * DIA),
  },
  {
    id: 22, empresa_id: 7, cliente_id: 11, nome: "Paulo Nunes",
    email: "paulo@graficaexemplo.example", telefone: "71900002222", ativo: true,
    portal_acesso: "ACOMPANHAR", portal_senha_definida_em: iso(inicio - 20 * DIA),
    criado_em: iso(inicio - 80 * DIA), atualizado_em: iso(inicio - 80 * DIA),
  },
];

/* ─── Equipamentos ─── */
type Equip = Record<string, unknown> & { id: number; status: string; atualizado_em: string };

function novoEquipamento(id: number, modelo: string, serie: string, patrimonio: string, valor: number): Equip {
  return {
    id,
    empresa_id: 7,
    serial_number: serie,
    patrimonio,
    marca: "Zebra",
    modelo,
    tipo: "Impressora de Código de Barra",
    status: "AGUARDANDO_APROVACAO",
    defeito_relatado: "Não imprime etiquetas",
    data_entrada: dataIso(inicio - 5 * DIA),
    cliente_id: 11,
    cliente_nome: cliente.nome,
    cliente_documento: cliente.documento,
    cliente_telefone: cliente.telefone,
    cliente_email: cliente.email,
    responsavel_contato_id: 21,
    responsavel_nome: "Marina Alves",
    responsavel_email: "marina@graficaexemplo.example",
    responsavel_telefone: "71900001111",
    valor_orcamento: valor,
    prazo_aprovacao: dataIso(inicio + 3 * DIA),
    resposta_cliente: null,
    resposta_cliente_situacao: null,
    criado_em: iso(inicio - 5 * DIA),
    atualizado_em: iso(inicio - 1 * DIA),
  };
}

const equipamentos: Equip[] = [novoEquipamento(10, "ZD620", "ZD620-DEMO-001", "PAT-0101", 480)];
const todosEquipamentos = () => [equipamentos[0]];
const achar = (id: unknown) => equipamentos.find((e) => e.id === Number(id));
const tocar = (e: Equip) => { e.atualizado_em = iso(Date.now()); };

const verificacao = (equipamentoId: number, total: number) => ({
  id: 100 + equipamentoId,
  equipamento_id: equipamentoId,
  empresa_id: 7,
  tecnico_nome: "Técnico Demo",
  problema_relatado: "Não imprime etiquetas",
  diagnostico: "Cabeça de impressão desgastada e sensor de gap descalibrado.",
  servicos_necessarios: JSON.stringify([
    { id: "s1", descricao: "Troca da cabeça de impressão", valor: total - 130 },
    { id: "s2", descricao: "Calibração de sensor e limpeza", valor: 130 },
  ]),
  pecas_necessarias: "[]",
  custo_total: total,
  tempo_estimado: 4,
  concluida: true,
  observacoes: "",
  adjusted_at: null,
});

/* ─── Estado do portal por atendimento ─── */
type Resposta = {
  id: number;
  origem: "PORTAL_CLIENTE";
  decisao: "APROVAR" | "RECUSAR" | "DESFEITA";
  registradaEm: string;
  contato: string;
  aplicadaEm?: string | null;
  aplicadaPeloSistema?: boolean;
  efetivacaoErro?: string | null;
  efetivacaoFalhouEm?: string | null;
};
type Solicitacao = {
  id: number;
  tipo: "DUVIDA" | "MUDANCA" | "NEGOCIAR";
  mensagem: string;
  criadaEm: string;
  tratadaEm?: string | null;
  contato?: string | null;
  contatoTelefone?: string | null;
  contatoEmail?: string | null;
};
type EstadoPublicacao = {
  versaoId: number;
  versao: number;
  criadaEm: string;
  encerrada: boolean;
  resposta: Resposta | null;
  historico: Resposta[];
  solicitacoes: Solicitacao[];
  aplicavelAPartirDe: string | null;
};
const publicacoes = new Map<number, EstadoPublicacao>();
let proximaVersaoId = 500;
let proximaRespostaId = 900;

let portalAtivo = false;
let respostasAtivas = false;

const contatoEmpresa = {
  nomeExibicao: "Assistência Técnica Exemplo",
  whatsapp: "71900003333",
  email: "atendimento@assistencia.example",
  telefone: "7130001234",
  horario: "Seg a sex, 8h às 18h",
  endereco: "Rua Exemplo, 100 - Salvador/BA",
  mapsUrl: null as string | null,
};

/* ─── Alertas do sino ─── */
type Alerta = {
  id: number;
  equipamentoId: number;
  tipo: string;
  titulo: string;
  detalhe: string;
  criadoEm: string;
  lidoEm: string | null;
  lidoPor: string | null;
  decisao: "APROVAR" | "RECUSAR" | "DESFEITA" | null;
};
const alertas: Alerta[] = [];
let proximoAlertaId = 1;
function novoAlerta(equipamentoId: number, tipo: string, titulo: string, detalhe: string, decisao: Alerta["decisao"] = null) {
  alertas.unshift({
    id: proximoAlertaId++, equipamentoId, tipo, titulo, detalhe,
    criadoEm: iso(Date.now()), lidoEm: null, lidoPor: null, decisao,
  });
}

function infoDecisao(equip: Equip) {
  const pub = publicacoes.get(equip.id);
  if (!pub) return null;
  const prazo = new Date(String(equip.prazo_aprovacao) + "T03:00:00Z").getTime() + DIA;
  const resposta = pub.resposta;
  const aplicavel = pub.aplicavelAPartirDe ? new Date(pub.aplicavelAPartirDe).getTime() : null;
  return {
    versaoId: pub.versaoId,
    versao: pub.versao,
    valorTotal: Number(equip.valor_orcamento),
    validoAte: iso(prazo),
    criadaEm: pub.criadaEm,
    encerradaMotivo: pub.encerrada ? "ORCAMENTO_ALTERADO" : null,
    aceiteOnlineAtivo: respostasAtivas,
    resposta,
    historico: pub.historico,
    solicitacoes: pub.solicitacoes,
    aplicavelAPartirDe: pub.aplicavelAPartirDe,
    podeAplicar: Boolean(resposta && !resposta.aplicadaEm && (aplicavel === null || aplicavel <= Date.now())),
    efetivacaoAutomatica: resposta?.origem === "PORTAL_CLIENTE",
  };
}

/* ─── Ações do "lado do cliente", chamadas pelo roteiro de gravação ─── */
function respostaAtual(equip: Equip) {
  return publicacoes.get(equip.id)!;
}

const controles = {
  /** O cliente aceita no portal: resposta em prazo de correção de 15 minutos. */
  clienteAceita(id = 10) {
    const equip = achar(id)!;
    const pub = respostaAtual(equip);
    const agora = Date.now();
    const confirma = agora + 15 * MINUTO;
    const resposta: Resposta = {
      id: proximaRespostaId++, origem: "PORTAL_CLIENTE", decisao: "APROVAR",
      registradaEm: iso(agora), contato: "Marina Alves",
    };
    pub.resposta = resposta;
    pub.historico = [resposta, ...pub.historico];
    pub.aplicavelAPartirDe = iso(confirma);
    equip.resposta_cliente = "APROVAR";
    equip.resposta_cliente_situacao = "EM_CORRECAO";
    tocar(equip);
    novoAlerta(
      Number(equip.id), "RESPOSTA_RECEBIDA", `Aceite recebido — confirma às ${horaCurta(confirma)}`,
      `Marina Alves aceitou o orçamento da Zebra ${equip.modelo}.\nNão comece o serviço antes desse horário: o cliente ainda pode desfazer.`,
      "APROVAR",
    );
  },
  /** O prazo de 15 minutos termina e o servidor efetiva sozinho. */
  passaPrazo(id = 10) {
    const equip = achar(id)!;
    const pub = respostaAtual(equip);
    const agora = Date.now();
    if (pub.resposta) {
      pub.resposta = { ...pub.resposta, aplicadaEm: iso(agora), aplicadaPeloSistema: true };
      pub.historico = pub.historico.map((h) => (h.id === pub.resposta!.id ? pub.resposta! : h));
    }
    pub.aplicavelAPartirDe = iso(agora - MINUTO);
    equip.status = "APROVADO";
    equip.resposta_cliente = null;
    equip.resposta_cliente_situacao = null;
    equip.data_aprovacao = dataIso(agora);
    tocar(equip);
    novoAlerta(
      Number(equip.id), "DECISAO_EFETIVADA", "Orçamento aprovado pelo cliente",
      `Zebra ${equip.modelo}: status APROVADO e pagamento "a combinar" aplicados automaticamente.`,
      "APROVAR",
    );
  },
  estado() {
    return {
      status: equipamentos[0].status,
      alertasNaoLidos: alertas.filter((a) => !a.lidoEm).length,
    };
  },
};

/**
 * O Vite pode carregar este módulo duas vezes (cópia pré-empacotada e cópia direta). O primeiro a
 * carregar vira o dono do estado: os dois chamam o mesmo `invoke` e os mesmos controles.
 */
type Global = { __portalVideo?: typeof controles; __portalVideoInvoke?: typeof invokeLocal };
const global = globalThis as unknown as Global;
global.__portalVideo ??= controles;

const sinalizado = new Set<string>();

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return (global.__portalVideoInvoke ?? invokeLocal)(command, args) as Promise<T>;
}

async function invokeLocal<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const a = args ?? {};
  switch (command) {
    /* sessão e banco */
    case "verificar_status_banco":
      return true as T;
    case "get_sensitive_access_status":
    case "set_active_security_profile":
    case "unlock_sensitive_access":
      return structuredClone(statusAcesso) as T;
    case "lock_sensitive_access":
      return true as T;
    case "verificar_config_inatividade":
      return false as T;
    case "carregar_config_banco":
    case "obter_config_banco_atual":
    case "obter_erro_inicializacao_banco":
      return null as T;
    case "list_security_profiles":
      return [structuredClone(perfil)] as T;

    /* portal: ligar/desligar e contato da empresa */
    case "obter_estado_portal":
      return { portalAtivo, respostasAtivas, respostasAtrasadas: 0 } as T;
    case "definir_estado_portal":
      portalAtivo = Boolean(a.portalAtivo);
      respostasAtivas = portalAtivo && Boolean(a.respostasAtivas);
      return { portalAtivo, respostasAtivas, respostasAtrasadas: 0 } as T;
    case "obter_contato_portal_empresa":
      return structuredClone(contatoEmpresa) as T;
    case "salvar_contato_portal_empresa":
      Object.assign(contatoEmpresa, a.input);
      return structuredClone(contatoEmpresa) as T;

    /* clientes e contatos */
    case "listar_clientes":
      return [cliente] as T;
    case "listar_clientes_paginados":
      return { items: [cliente], total: 1 } as T;
    case "buscar_cliente":
      return cliente as T;
    case "listar_equipamentos_cliente":
      return todosEquipamentos() as T;
    case "listar_cliente_contatos":
      return structuredClone(contatos.filter((c) => c.ativo)) as T;
    case "definir_acesso_portal_contato": {
      const contato = contatos.find((c) => c.id === Number(a.contatoId));
      if (!contato) throw "Contato não encontrado.";
      contato.portal_acesso = a.acesso as Contato["portal_acesso"];
      contato.atualizado_em = iso(Date.now());
      return structuredClone(contato) as T;
    }
    case "definir_senha_portal_contato": {
      const contato = contatos.find((c) => c.id === Number(a.contatoId));
      if (!contato) throw "Contato não encontrado.";
      contato.portal_senha_definida_em = a.senha ? iso(Date.now()) : null;
      if (!a.senha) contato.portal_acesso = "NENHUM";
      return structuredClone(contato) as T;
    }

    /* equipamentos */
    case "listar_equipamentos": {
      const filtro = a.status as string | undefined;
      return todosEquipamentos().filter((e) => !filtro || filtro === "TODOS" || e.status === filtro) as T;
    }
    case "listar_equipamentos_paginados": {
      const filtro = a.status as string | undefined;
      const busca = String(a.busca ?? "").toLowerCase();
      const items = todosEquipamentos().filter((e) =>
        (!filtro || filtro === "TODOS" || e.status === filtro) &&
        (!busca || `${e.serial_number} ${e.modelo} ${e.cliente_nome}`.toLowerCase().includes(busca)));
      const pagina = Math.max(0, Number(a.page ?? 0));
      return { items: items.slice(pagina * 10, (pagina + 1) * 10), total: items.length } as T;
    }
    case "buscar_equipamento":
      return achar(a.id ?? a.equipamentoId) as T;
    case "buscar_equipamentos_por_serial":
      return todosEquipamentos() as T;
    case "buscar_verificacao_tecnica":
    case "buscar_verificacao": {
      const equip = achar(a.equipamentoId ?? a.id) ?? equipamentos[0];
      return verificacao(equip.id, Number(equip.valor_orcamento)) as T;
    }
    case "listar_servicos_catalogo_ativos":
      return [] as T;
    case "listar_imagens_equipamento":
    case "listar_historico_equipamento":
    case "listar_comunicacoes":
    case "listar_produtos":
      return [] as T;
    case "listar_produtos_paginados":
    case "listar_servicos_paginados":
      return { items: [], total: 0, belowMinimum: 0 } as T;

    /* orçamento no portal */
    case "obter_decisao_orcamento": {
      const equip = achar(a.equipamentoId);
      return (equip ? infoDecisao(equip) : null) as T;
    }
    case "publicar_orcamento_portal": {
      const equip = achar(a.equipamentoId);
      if (!equip) throw "Equipamento não encontrado.";
      const antiga = publicacoes.get(equip.id);
      const versao = (antiga?.versao ?? 0) + 1;
      publicacoes.set(equip.id, {
        versaoId: proximaVersaoId++, versao, criadaEm: iso(Date.now()), encerrada: false,
        resposta: null, historico: antiga?.historico ?? [], solicitacoes: antiga?.solicitacoes ?? [],
        aplicavelAPartirDe: null,
      });
      equip.resposta_cliente = null;
      equip.resposta_cliente_situacao = null;
      tocar(equip);
      return { versaoId: proximaVersaoId - 1, versao, nova: true } as T;
    }
    case "marcar_solicitacao_orcamento_tratada": {
      for (const pub of publicacoes.values()) {
        for (const s of pub.solicitacoes) if (s.id === Number(a.solicitacaoId)) s.tratadaEm = iso(Date.now());
      }
      return true as T;
    }

    /* sino */
    case "contar_alertas_portal_nao_lidos":
      return alertas.filter((x) => !x.lidoEm).length as T;
    case "listar_alertas_portal": {
      const soNaoLidos = Boolean(a.apenasNaoLidos);
      return structuredClone(alertas.filter((x) => !soNaoLidos || !x.lidoEm).slice(0, Number(a.limite ?? 50))) as T;
    }
    case "marcar_alertas_portal_lidos": {
      let n = 0;
      for (const x of alertas) {
        if (!x.lidoEm && (a.alertaId == null || x.id === Number(a.alertaId))) {
          x.lidoEm = iso(Date.now());
          x.lidoPor = perfil.nome;
          n += 1;
        }
      }
      return n as T;
    }

    case "abrir_url":
      return undefined as T;

    default:
      if (!sinalizado.has(command)) {
        sinalizado.add(command);
        console.warn(`[portal-video-mock] comando sem implementação: ${command}`);
      }
      return undefined as T;
  }
}

global.__portalVideoInvoke ??= invokeLocal;
