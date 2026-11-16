import { STATUS_LABELS, STATUS_COLORS, type StatusEquipamento } from "@/types";
import { STATUS_BADGE_LABELS_PADRAO } from "./equipamentos-page-constants";

/** Badge colorido com o label do status do equipamento */
export function StatusBadge({ status, completo = false }: { status: string; completo?: boolean }) {
  const statusKey = status as StatusEquipamento;
  // `completo`: nome inteiro (onde há espaço, como o título de Detalhes da OS); senão o curto dos selos.
  const label = (completo ? STATUS_LABELS[statusKey] : STATUS_BADGE_LABELS_PADRAO[statusKey]) || STATUS_LABELS[statusKey] || status;
  const color = STATUS_COLORS[status as StatusEquipamento] || STATUS_COLORS.RECEBIDO;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${color}`}>
      <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" />
      {label}
    </span>
  );
}
