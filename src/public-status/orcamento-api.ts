export interface OrcamentoPeca {
  nome: string;
  quantidade: number;
  valorUnitario?: number;
  valorTotal?: number;
}

export interface OrcamentoServico {
  descricao: string;
  valor: number;
  pecas: OrcamentoPeca[];
}

export type DecisaoCliente = "APROVAR" | "RECUSAR" | "DESFEITA";

export interface OrcamentoResposta {
  id: number;
  decisao: DecisaoCliente;
  registradaEm: string;
  janelaAte: string;
  aplicada: boolean;
}

export interface OrcamentoPublico {
  /** ABERTO aceita resposta; APLICADO significa que a equipe já registrou a decisão. */
  estado: "ABERTO" | "APLICADO";
  versao: number;
  equipamento: string;
  valorTotal: number;
  validoAte: string | null;
  servicos: OrcamentoServico[];
  pecas: OrcamentoPeca[];
  janelaMinutos: number;
  resposta: OrcamentoResposta | null;
}

export interface RespostaRegistrada {
  respostaId: number;
  decisao: DecisaoCliente;
  registradaEm: string;
  janelaAte: string;
  repetida: boolean;
}

export type OrcamentoErrorKind = "rate-limit" | "service" | "unavailable" | "outdated" | "applied" | "limit";

export class OrcamentoRequestError extends Error {
  constructor(public readonly kind: OrcamentoErrorKind) {
    super(kind);
  }
}

const API_URL = import.meta.env.VITE_ORCAMENTO_DECISAO_API_URL
  || "https://sgaqvxubopgwysnyocjs.supabase.co/functions/v1/orcamento-decisao";

async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const response = await fetch(API_URL, {
    method: "POST",
    mode: "cors",
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });

  if (!response.ok) {
    let codigo = "";
    try {
      codigo = String((await response.json() as { codigo?: unknown }).codigo ?? "");
    } catch {
      // Sem corpo legível: usa só o status HTTP.
    }
    if (response.status === 409) {
      throw new OrcamentoRequestError(codigo === "JA_APLICADA" ? "applied" : "outdated");
    }
    if (response.status === 429) {
      throw new OrcamentoRequestError(codigo === "LIMITE" ? "limit" : "rate-limit");
    }
    throw new OrcamentoRequestError(response.status >= 500 ? "service" : "unavailable");
  }
  return await response.json() as T;
}

export const consultarOrcamento = (token: string) =>
  chamar<OrcamentoPublico>({ acao: "consultar", token });

export const responderOrcamento = (token: string, decisao: DecisaoCliente, respostaVigenteId: number) =>
  chamar<RespostaRegistrada>({ acao: "responder", token, decisao, respostaVigenteId });

export const solicitarContatoOrcamento = (token: string, tipo: "DUVIDA" | "MUDANCA", mensagem: string) =>
  chamar<{ recebidaEm: string }>({ acao: "solicitar", token, tipo, mensagem });
