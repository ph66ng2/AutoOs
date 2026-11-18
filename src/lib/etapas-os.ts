import type { EtapaDaBarra } from "@/components/detalhe/BarraEtapas";
import { ETAPAS_OS, FAMILIA_COR_CHEIA, etapaOsAtual, statusFamilia } from "@/lib/status-familia";
import { STATUS_LABELS, type EquipamentoHistoricoEvento, type StatusEquipamento } from "@/types";

function diaMes(valor: string): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Bahia", day: "2-digit", month: "2-digit" });
}

/**
 * As 6 etapas de Detalhes da OS com "dd/mm · pessoa" (decisão 25). A data de cada etapa é a
 * da primeira vez que o histórico de status chegou nela; a pessoa só aparece quando o
 * histórico registra o autor. Na etapa atual de um desvio (Reprovado, Orçamento vencido,
 * Abandonado não marca etapa), o nome do status ocupa o lugar da pessoa. Horário legado
 * inconsistente não vira data: a linha fica vazia.
 */
export function etapasDaOs(status: string, historico: EquipamentoHistoricoEvento[] = []): EtapaDaBarra[] {
  const atual = etapaOsAtual(status);
  const entregue = atual === ETAPAS_OS.length - 1;
  const familia = statusFamilia(status);
  const ordenado = [...historico].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());
  const chegada = new Map<number, EquipamentoHistoricoEvento>();
  for (const evento of ordenado) {
    const indice = etapaOsAtual(evento.status);
    if (indice >= 0 && !chegada.has(indice)) chegada.set(indice, evento);
  }

  return ETAPAS_OS.map((rotulo, indice) => {
    const estado: EtapaDaBarra["estado"] = entregue || indice < atual ? "feita" : indice === atual ? "atual" : "futura";
    if (estado === "futura") return { rotulo, estado };
    const evento = chegada.get(indice);
    const data = evento && evento.data_confiavel !== false ? diaMes(evento.data) : "";
    const desvio = estado === "atual" && familia === "bad" ? STATUS_LABELS[status as StatusEquipamento] ?? status : "";
    const quem = desvio || evento?.autor?.trim() || "";
    return {
      rotulo,
      estado,
      detalhe: [data, quem].filter(Boolean).join(" · "),
      cor: estado === "atual" && !entregue ? FAMILIA_COR_CHEIA[familia] : undefined,
    };
  });
}
