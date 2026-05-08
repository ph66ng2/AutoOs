import { STATUS_LABELS, STATUS_COLORS, type StatusEquipamento } from "@/types";
import { STATUS_BADGE_LABELS_PADRAO } from "./equipamentos-page-constants";

/** Badge colorido com o label do status do equipamento */
export function StatusBadge({ status }: { status: string }) {
  const statusKey = status as StatusEquipamento;
  const label = STATUS_BADGE_LABELS_PADRAO[statusKey] || STATUS_LABELS[statusKey] || status;
  const color = STATUS_COLORS[status as StatusEquipamento] || "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
