import { STATUS_LABELS, STATUS_COLORS, type StatusEquipamento } from "@/types";

/** Badge de status de equipamento na expansão do cliente */
export function ClientesStatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as StatusEquipamento] || status;
  const color = STATUS_COLORS[status as StatusEquipamento] || STATUS_COLORS.RECEBIDO;
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 break-all rounded-full px-2.5 py-0.5 text-center text-xs font-bold ${color}`}>
      <span aria-hidden="true" className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" />
      {label}
    </span>
  );
}
