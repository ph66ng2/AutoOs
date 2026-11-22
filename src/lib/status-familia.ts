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

/** As 6 etapas da barra grande (Detalhes da OS e portal). */
export const ETAPAS_OS = ["Recebido", "Verificação", "Orçamento", "Manutenção", "Pronto", "Entregue"] as const;

/**
 * Índice da etapa atual na barra grande (0 a 5). Desvios ficam na etapa onde
 * aconteceram. Entregue conclui todas; Abandonado (-1) não marca nenhuma.
 */
const ETAPA_OS_ATUAL: Record<string, number> = {
  RECEBIDO: 0,
  EM_VERIFICACAO: 1,
  VERIFICADO: 2,
  AGUARDANDO_APROVACAO: 2,
  REPROVADO: 2,
  ORCAMENTO_VENCIDO: 2,
  APROVADO: 3,
  EM_MANUTENCAO: 3,
  AGUARDANDO_PECA: 3,
  PRONTO: 4,
  ENTREGUE: 5,
  ABANDONADO: -1,
};

export function etapaOsAtual(status: string): number {
  return ETAPA_OS_ATUAL[normalizeStatusKey(status)] ?? -1;
}

/** Status que formam cada etapa da barra grande, na ordem do mapa acima (Início › Fila por etapa). */
export function statusDaEtapaOs(indice: number): string[] {
  return Object.entries(ETAPA_OS_ATUAL)
    .filter(([, etapa]) => etapa === indice)
    .map(([status]) => status);
}
