import { STATUS_LABELS, STATUS_COLORS, type StatusEquipamento } from "@/types";

/** Badge de status de equipamento na expansão do cliente */
export function ClientesStatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as StatusEquipamento] || status;
  const color = STATUS_COLORS[status as StatusEquipamento] || "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}
