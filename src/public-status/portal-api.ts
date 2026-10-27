/** Cliente da Edge Function `portal-cliente`. Só JSON; nenhuma chave do Supabase no navegador. */
import { useSyncExternalStore } from "react";

export type Acesso = "ACOMPANHAR" | "DECIDIR";
export type Decisao = "APROVAR" | "RECUSAR" | "DESFEITA";
export type EstadoResposta = "EM_CORRECAO" | "PROCESSANDO" | "PENDENTE_EQUIPE" | "EFETIVADA" | "AGUARDANDO_EQUIPE" | null;
export type EstadoOrcamento = "ABERTA" | "RESPONDIDA" | "EM_REVISAO" | "VENCIDA" | "ENCERRADA";
export type TipoSolicitacao = "NEGOCIAR" | "DUVIDA" | "MUDANCA";
export type EtapaStatus =
  | "RECEBIDO" | "EM_VERIFICACAO" | "VERIFICADO" | "AGUARDANDO_APROVACAO" | "APROVADO"
  | "REPROVADO" | "EM_MANUTENCAO" | "AGUARDANDO_PECA" | "PRONTO" | "ENTREGUE";
export type CategoriaFoto = "ENTRADA" | "SAIDA" | "VERIFICACAO";
/** Situação de uma linha do histórico: da resposta (estado atual, DESFEITA, SUBSTITUIDA) ou da solicitação. */
export type SituacaoHistorico = Exclude<EstadoResposta, null> | "DESFEITA" | "SUBSTITUIDA" | "TRATADA" | "AGUARDANDO";

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
  /** COALESCE(valor final, valor do orçamento); null enquanto não há valor. */
  valorAtual: number | null;
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
  ordemCompra: string | null;
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
  endereco: string | null;
  /** Sempre https. */
  mapsUrl: string | null;
}

export interface ClientePortal {
  nome: string;
  /** Só dígitos: CPF (11) ou CNPJ (14); null se o cadastro não tiver um válido. */
  documento: string | null;
  exigeOrdemCompra: boolean;
}

export interface ValoresAtendimento {
  orcamento: number | null;
  final: number | null;
  atual: number | null;
}

export interface EtapaAtendimento {
  status: EtapaStatus;
  em: string;
}

/** A Edge Function troca o `caminho` do Storage por `url` absoluta. */
export interface FotoAtendimento {
  id: number;
  categoria: CategoriaFoto;
  url: string;
  largura: number | null;
  altura: number | null;
}

export interface ItemHistorico {
  tipo: "RESPOSTA" | "SOLICITACAO";
  /** Resposta: Decisao. Solicitação: TipoSolicitacao. */
  subtipo: Decisao | TipoSolicitacao;
  versao: number;
  valor: number;
  em: string;
  contato: string | null;
  /** R-n (resposta) ou S-n (solicitação). */
  protocolo: string;
  mensagem: string | null;
  situacao: SituacaoHistorico | null;
  ordemCompra: string | null;
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
  cliente: ClientePortal | null;
  defeitoRelatado: string | null;
  valores: ValoresAtendimento;
  etapas: EtapaAtendimento[];
  fotos: FotoAtendimento[];
  /** Tudo que o cliente fez no orçamento, em todas as versões, do mais recente ao mais antigo (até 100). */
  historico: ItemHistorico[];
  orcamento: OrcamentoPortal | null;
  solicitacoes: Array<{ id: number; tipo: TipoSolicitacao; criadoEm: string; tratada: boolean; contato: string | null; protocolo: string }>;
  contatoEmpresa: ContatoEmpresa | null;
  podeDecidir: boolean;
  verificacaoRecente: boolean;
  contato: string;
  /** O contato logado tem telefone / e-mail no cadastro (para a tela decidir se pede e se oferece salvar). */
  temTelefone: boolean;
  temEmail: boolean;
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
  ordemCompra: string | null;
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

/** Telefone/e-mail de retorno de uma solicitação; `salvarNoContato` só preenche campos vazios do cadastro. */
export interface ContatoRetorno {
  telefone?: string;
  email?: string;
  salvarNoContato?: boolean;
}

export const portalApi = {
  entrarSenha: (documento: string, senha: string) =>
    post<{ sessao: string; contato: string; acesso: Acesso; expiraEm: string }>({ acao: "entrarSenha", documento, senha }),
  confirmarSenha: (sessao: string, senha: string) => post<{ ok: boolean }>({ acao: "confirmarSenha", sessao, senha }),
  listar: (sessao: string) => post<ListaAtendimentos>({ acao: "listar", sessao }),
  detalhe: (sessao: string, equipamentoId: number) => post<DetalheAtendimento>({ acao: "detalhe", sessao, equipamentoId }),
  /** `ordemCompra` é obrigatória para APROVAR quando `cliente.exigeOrdemCompra` (erro ORDEM_COMPRA_OBRIGATORIA, 422). */
  responder: (
    sessao: string, equipamentoId: number, versaoId: number, decisao: Decisao, respostaVigenteId: number | null,
    ordemCompra?: string,
  ) =>
    post<{ comprovante: Comprovante }>({ acao: "responder", sessao, equipamentoId, versaoId, decisao, respostaVigenteId, ordemCompra }),
  /** Telefone/e-mail inválidos voltam como CONTATO_INVALIDO (400). */
  solicitar: (
    sessao: string, equipamentoId: number, versaoId: number, tipo: TipoSolicitacao, mensagem: string,
    contato?: ContatoRetorno,
  ) =>
    post<{ solicitacao: SolicitacaoRegistrada }>({ acao: "solicitar", sessao, equipamentoId, versaoId, tipo, mensagem, ...contato }),
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

/** CPF (11 dígitos) ou CNPJ (14) com máscara; null quando não for um dos dois. */
export function formatarDocumento(documento: string | null | undefined): string | null {
  const digits = (documento ?? "").replace(/\D/g, "");
  if (digits.length === 14) return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (digits.length === 11) return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return null;
}

export type IntencaoMensagem = Decisao | TipoSolicitacao | "CONVERSAR";

/** Telefone com DDD (10 ou 11 dígitos, com ou sem 55). */
export function telefoneValido(valor: string): boolean {
  const digits = valor.replace(/\D/g, "");
  const local = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
  return local.length === 10 || local.length === 11;
}

export function emailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor) && valor.length <= 254;
}

/** Mensagem pronta para o WhatsApp/e-mail. O registro no AutoOS não depende dela. */
export function mensagemWhatsapp(input: {
  contato: string;
  cliente?: ClientePortal | null;
  empresa?: string;
  intencao: IntencaoMensagem;
  equipamento: string;
  serie: string | null;
  versao?: number;
  valor?: number;
  protocolo?: string | null;
  ordemCompra?: string | null;
  telefone?: string | null;
  email?: string | null;
  /** O que o cliente escreveu no pedido (opcional). */
  observacao?: string | null;
}): string {
  const documento = formatarDocumento(input.cliente?.documento);
  const rotuloDoc = documento ? `${documento.length === 18 ? "CNPJ" : "CPF"} ${documento}` : null;
  const nomeCliente = input.cliente?.nome?.trim() || null;
  const mesmaPessoa = nomeCliente !== null && nomeCliente.toLowerCase() === input.contato.trim().toLowerCase();
  let quem = `Aqui é ${input.contato}`;
  if (nomeCliente && !mesmaPessoa) quem += `, da ${nomeCliente}`;
  if (rotuloDoc) quem += ` (${rotuloDoc})`;

  const item = `${input.equipamento}${input.serie ? ` (série ${input.serie})` : ""}`;
  const detalhes = input.versao !== undefined && input.valor !== undefined
    ? `, versão ${input.versao}, ${money(input.valor)}`
    : "";
  const oc = input.ordemCompra ? ` Ordem de compra: ${input.ordemCompra}.` : "";
  let corpo: string;
  let fecho: string;
  switch (input.intencao) {
    case "APROVAR":
      corpo = `Aceitei pelo Portal das Impressoras o orçamento da ${item}${detalhes}.${oc}`;
      fecho = "Obrigado pela atenção! Qualquer novidade, me avisem.";
      break;
    case "RECUSAR":
      corpo = `Registrei pelo Portal das Impressoras a recusa do orçamento da ${item}${detalhes}.`;
      fecho = "Se houver espaço para ajustar valores ou itens, vamos conversar?";
      break;
    case "DESFEITA":
      corpo = `Cancelei pelo Portal das Impressoras a minha resposta ao orçamento da ${item}${detalhes}.`;
      fecho = "Podemos conversar sobre a proposta?";
      break;
    case "NEGOCIAR":
      corpo = `Pedi pelo Portal das Impressoras para negociar o orçamento da ${item}${detalhes}.`;
      fecho = "Podemos conversar?";
      break;
    case "MUDANCA":
      corpo = `Pedi pelo Portal das Impressoras uma correção na minha decisão sobre o orçamento da ${item}${detalhes}.`;
      fecho = "Podemos acertar isso?";
      break;
    case "DUVIDA":
      corpo = `Tenho uma dúvida sobre o orçamento da ${item}${detalhes}, enviada pelo Portal das Impressoras.`;
      fecho = "Podem me ajudar?";
      break;
    default:
      corpo = `Estou olhando pelo Portal das Impressoras o orçamento da ${item}${detalhes} e gostaria de conversar antes de decidir.`;
      fecho = "Podemos conversar?";
  }
  const linhas = [`Olá, equipe ${input.empresa ?? "BMI TAG"}! ${quem}.`, corpo];
  if (input.observacao?.trim()) linhas.push(`Resumo do pedido: ${input.observacao.trim()}`);
  const retorno = [input.telefone ? `telefone ${input.telefone}` : null, input.email ? `e-mail ${input.email}` : null].filter(Boolean);
  if (retorno.length) linhas.push(`Para falar comigo: ${retorno.join(" ou ")}.`);
  linhas.push(input.protocolo ? `Protocolo ${input.protocolo}. ${fecho}` : fecho);
  return linhas.join("\n");
}

export function mailtoUrl(email: string, assunto: string, texto: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
}

// Contato da empresa conhecido na sessão: só o detalhe do atendimento o traz, mas o aviso de testes
// (PortalApp) aparece em todas as telas e precisa do WhatsApp quando já houver.
let contatoEmpresaAtual: ContatoEmpresa | null = null;
const ouvintesContato = new Set<() => void>();

export function definirContatoEmpresa(contato: ContatoEmpresa | null): void {
  if (contatoEmpresaAtual === contato) return;
  contatoEmpresaAtual = contato;
  ouvintesContato.forEach((ouvinte) => ouvinte());
}

export function useContatoEmpresa(): ContatoEmpresa | null {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintesContato.add(ouvinte);
      return () => ouvintesContato.delete(ouvinte);
    },
    () => contatoEmpresaAtual,
    () => null,
  );
}

export function whatsappUrl(numero: string, texto: string): string {
  const digits = numero.replace(/\D/g, "");
  const full = digits.length >= 12 && digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(texto)}`;
}
