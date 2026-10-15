/** Cliente da Edge Function `portal-cliente`. Só JSON; nenhuma chave do Supabase no navegador. */

export type Acesso = "ACOMPANHAR" | "DECIDIR";
export type Decisao = "APROVAR" | "RECUSAR" | "DESFEITA";
export type EstadoResposta = "EM_CORRECAO" | "PROCESSANDO" | "PENDENTE_EQUIPE" | "EFETIVADA" | "AGUARDANDO_EQUIPE" | null;
export type EstadoOrcamento = "ABERTA" | "RESPONDIDA" | "EM_REVISAO" | "VENCIDA" | "ENCERRADA";
export type TipoSolicitacao = "NEGOCIAR" | "DUVIDA" | "MUDANCA";

export interface AtendimentoResumo {
  id: number;
  equipamento: string;
  serie: string | null;
  patrimonio: string | null;
  status: string;
  titulo: string;
  historico: boolean;
  entradaEm: string | null;
  atividadeEm: string | null;
  statusAlteradoEm: string | null;
  aguardaResposta: boolean;
  resposta: EstadoResposta;
}

export interface ListaAtendimentos {
  cliente: string | null;
  contato: string;
  podeDecidir: boolean;
  atendimentos: AtendimentoResumo[];
}

export interface RespostaOrcamento {
  id: number;
  decisao: Decisao;
  origem: "PORTAL_CLIENTE" | "PORTAL" | "EQUIPE";
  registradaEm: string;
  janelaAte: string;
  contato: string | null;
  propria: boolean;
  estado: EstadoResposta;
  efetivadaEm: string | null;
  protocolo: string;
}

export interface OrcamentoPortal {
  versaoId: number;
  versao: number;
  publicadaEm: string;
  valorTotal: number;
  validoAte: string | null;
  estado: EstadoOrcamento;
  servicos: Array<{ descricao: string; valor: number; pecas: Array<{ nome: string; quantidade: number; valorUnitario: number }> }>;
  pecas: Array<{ nome: string; quantidade: number; valorTotal: number }>;
  janelaMinutos: number;
  aceiteOnline: boolean;
  resposta: RespostaOrcamento | null;
}

export interface ContatoEmpresa {
  nome: string;
  whatsapp: string | null;
  email: string | null;
  telefone: string | null;
  horario: string | null;
}

export interface DetalheAtendimento {
  id: number;
  equipamento: string;
  serie: string | null;
  patrimonio: string | null;
  status: string;
  titulo: string;
  orientacao: string;
  statusAlteradoEm: string | null;
  entradaEm: string | null;
  orcamento: OrcamentoPortal | null;
  solicitacoes: Array<{ id: number; tipo: TipoSolicitacao; criadoEm: string; tratada: boolean; contato: string | null; protocolo: string }>;
  contatoEmpresa: ContatoEmpresa | null;
  podeDecidir: boolean;
  verificacaoRecente: boolean;
  contato: string;
}

export interface Comprovante {
  id: number;
  protocolo: string;
  decisao: Decisao;
  registradaEm: string;
  janelaAte: string;
  versao: number;
  valorTotal: number;
  equipamento: string;
  serie: string | null;
  contato: string;
  repetida: boolean;
}

export interface SolicitacaoRegistrada {
  id: number;
  protocolo: string;
  tipo: TipoSolicitacao;
  criadoEm: string;
}

export class PortalError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly codigo: string | null,
  ) {
    super(message);
  }
}

const API_URL = import.meta.env.VITE_PORTAL_CLIENTE_API_URL
  || "https://sgaqvxubopgwysnyocjs.supabase.co/functions/v1/portal-cliente";

async function post<T>(body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PortalError("Sem conexão com o portal. Confira sua internet e tente novamente.", 0, "SEM_CONEXAO");
  }
  let payload: Record<string, unknown> = {};
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const message = typeof payload.erro === "string"
      ? payload.erro
      : "O portal está temporariamente indisponível. Tente novamente em instantes.";
    throw new PortalError(message, response.status, typeof payload.codigo === "string" ? payload.codigo : null);
  }
  return payload as T;
}

export const portalApi = {
  solicitarCodigo: (documento: string, contato: string) =>
    post<{ desafio: string; canal: "WHATSAPP" | "EMAIL"; mensagem: string }>({ acao: "solicitarCodigo", documento, contato }),
  verificarCodigo: (desafio: string, codigo: string, sessao?: string) =>
    post<{ sessao: string | null; contato: string; acesso: Acesso; expiraEm: string; reverificada: boolean }>(
      { acao: "verificarCodigo", desafio, codigo, ...(sessao ? { sessao } : {}) },
    ),
  novoCodigo: (sessao: string, canal: "WHATSAPP" | "EMAIL") =>
    post<{ desafio: string; canal: "WHATSAPP" | "EMAIL"; mensagem: string }>({ acao: "novoCodigo", sessao, canal }),
  listar: (sessao: string) => post<ListaAtendimentos>({ acao: "listar", sessao }),
  detalhe: (sessao: string, equipamentoId: number) => post<DetalheAtendimento>({ acao: "detalhe", sessao, equipamentoId }),
  responder: (sessao: string, equipamentoId: number, versaoId: number, decisao: Decisao, respostaVigenteId: number | null) =>
    post<{ comprovante: Comprovante }>({ acao: "responder", sessao, equipamentoId, versaoId, decisao, respostaVigenteId }),
  solicitar: (sessao: string, equipamentoId: number, versaoId: number, tipo: TipoSolicitacao, mensagem: string) =>
    post<{ solicitacao: SolicitacaoRegistrada }>({ acao: "solicitar", sessao, equipamentoId, versaoId, tipo, mensagem }),
  sair: (sessao: string) => post<{ ok: boolean }>({ acao: "sair", sessao }),
};

export const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export const shortTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeStyle: "short" }).format(new Date(value));

export const shortDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value));

export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

/** Mensagem pronta para o WhatsApp Web. O registro no AutoOS não depende dela. */
export function mensagemWhatsapp(input: {
  contato: string;
  equipamento: string;
  serie: string | null;
  acao: string;
  versao?: number;
  valor?: number;
  protocolo: string;
}): string {
  const linhas = [
    `Olá! Aqui é ${input.contato}.`,
    `Pelo Portal das Impressoras, ${input.acao} — ${input.equipamento}${input.serie ? ` (série ${input.serie})` : ""}.`,
  ];
  if (input.versao !== undefined && input.valor !== undefined) {
    linhas.push(`Orçamento versão ${input.versao}, ${money(input.valor)}.`);
  }
  linhas.push(`Protocolo ${input.protocolo}.`);
  return linhas.join("\n");
}

export function whatsappUrl(numero: string, texto: string): string {
  const digits = numero.replace(/\D/g, "");
  const full = digits.length >= 12 && digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(texto)}`;
}
