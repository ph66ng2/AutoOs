import type { RespostaOrcamentoInfo, SolicitacaoOrcamentoInfo } from "@/types";

export const DECISAO_TEXTO: Record<RespostaOrcamentoInfo["decisao"], string> = {
  APROVAR: "aprovou",
  RECUSAR: "recusou",
  DESFEITA: "retirou a resposta",
};

export const MOTIVO_FALHA: Record<string, string> = {
  ETAPA_ALTERADA: "a etapa do equipamento mudou",
  PROPOSTA_ALTERADA: "o orçamento foi alterado",
  ATENDIMENTO_TRANSFERIDO: "o atendimento foi transferido de cliente",
  PECAS_SEM_SERVICO: "há peças antigas sem serviço vinculado",
  PRODUTO_INDISPONIVEL: "um produto do orçamento está inativo ou é de outra empresa",
  ORCAMENTO_INVALIDO: "os itens do orçamento estão inválidos",
};

export const TIPO_SOLICITACAO_TEXTO: Record<SolicitacaoOrcamentoInfo["tipo"], string> = {
  NEGOCIAR: "Pedido de negociação",
  MUDANCA: "Pedido de ajuste",
  DUVIDA: "Dúvida",
};

export function formatarHora(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

/** "14:32" se for hoje; senão "16/10 14:32". Para frases curtas como "aplica às 14:32". */
export function formatarQuando(value?: string | null, agora = new Date()) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(parsed);
  if (parsed.toDateString() === agora.toDateString()) return hora;
  const dia = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(parsed);
  return `${dia} ${hora}`;
}

export function formatarValor(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function origemTexto(item: RespostaOrcamentoInfo) {
  if (item.origem === "PORTAL_CLIENTE") return `Cliente no portal (${item.contato ?? "contato"})`;
  if (item.origem === "PORTAL") return "Cliente (link)";
  return `Equipe (${item.registradaPor ?? "—"})`;
}

export function textoOrdemCompra(item: Pick<RespostaOrcamentoInfo, "ordemCompra">) {
  const oc = item.ordemCompra?.trim();
  return oc ? `OC nº ${oc}` : null;
}
