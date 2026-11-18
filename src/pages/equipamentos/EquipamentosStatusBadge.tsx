import { Selo } from "@/components/detalhe/Selo";
import { STATUS_LABELS, STATUS_COLORS, type StatusEquipamento } from "@/types";
import { STATUS_BADGE_LABELS_PADRAO } from "./equipamentos-page-constants";

/** Selo do status do equipamento: o mesmo Selo do DS da página da venda (decisão 25). */
export function StatusBadge({ status, completo = false }: { status: string; completo?: boolean }) {
  const statusKey = status as StatusEquipamento;
  // `completo`: nome inteiro (onde há espaço, como o título de Detalhes da OS); senão o curto dos selos.
  const label = (completo ? STATUS_LABELS[statusKey] : STATUS_BADGE_LABELS_PADRAO[statusKey]) || STATUS_LABELS[statusKey] || status;
  const color = STATUS_COLORS[statusKey] || STATUS_COLORS.RECEBIDO;
  return <Selo rotulo={label} classes={color} />;
}
