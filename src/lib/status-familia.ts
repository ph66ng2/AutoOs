import { normalizeStatusKey } from "@/lib/status-fsm";

/**
 * Família visual de um status de OS (redesign, direção B).
 * neutral: entrou ou saiu · work: na nossa bancada · wait: esperando alguém de fora
 * ok: pronto · bad: precisa de decisão. A cor de status nunca vai em botão de ação.
 */
export type StatusFamilia = "neutral" | "work" | "wait" | "ok" | "bad";

const FAMILIA_POR_STATUS: Record<string, StatusFamilia> = {
  RECEBIDO: "neutral",
  ENTREGUE: "neutral",
  ABANDONADO: "neutral",
  EM_VERIFICACAO: "work",
  VERIFICADO: "work",
  APROVADO: "work",
  EM_MANUTENCAO: "work",
  AGUARDANDO_APROVACAO: "wait",
  AGUARDANDO_PECA: "wait",
  PRONTO: "ok",
  REPROVADO: "bad",
  ORCAMENTO_VENCIDO: "bad",
};

/** Classes literais (o Tailwind só gera classes escritas por extenso no código). */
export const FAMILIA_CLASSES: Record<StatusFamilia, string> = {
  neutral: "bg-status-neutral-bg text-status-neutral",
  work: "bg-status-work-bg text-status-work",
  wait: "bg-status-wait-bg text-status-wait",
  ok: "bg-status-ok-bg text-status-ok",
  bad: "bg-status-bad-bg text-status-bad",
};

export function statusFamilia(status: string): StatusFamilia {
  return FAMILIA_POR_STATUS[normalizeStatusKey(status)] ?? "neutral";
}

/** Cor cheia da família (traços da barra de etapas). */
export const FAMILIA_COR_CHEIA: Record<StatusFamilia, string> = {
  neutral: "bg-status-neutral",
  work: "bg-status-work",
  wait: "bg-status-wait",
  ok: "bg-status-ok",
  bad: "bg-status-bad",
};

export function statusFamiliaClasses(status: string): string {
  return FAMILIA_CLASSES[statusFamilia(status)];
}

/**
 * Quantos dos 7 traços da barra compacta (lista de equipamentos) ficam preenchidos.
 * Desvios param onde aconteceram: Aguardando peça na manutenção, Reprovado e
 * Orçamento vencido no orçamento. Abandonado não mostra avanço.
 */
const ETAPA_COMPACTA: Record<string, number> = {
  RECEBIDO: 1,
  EM_VERIFICACAO: 2,
  VERIFICADO: 3,
  AGUARDANDO_APROVACAO: 4,
  REPROVADO: 4,
  ORCAMENTO_VENCIDO: 4,
  APROVADO: 5,
  EM_MANUTENCAO: 6,
  AGUARDANDO_PECA: 6,
  PRONTO: 7,
  ENTREGUE: 7,
  ABANDONADO: 0,
};

export const TOTAL_ETAPAS_COMPACTAS = 7;

export function etapaCompacta(status: string): number {
  return ETAPA_COMPACTA[normalizeStatusKey(status)] ?? 0;
}
