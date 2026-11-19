import { History } from "lucide-react";
import type { Equipamento } from "@/types";
import { formatDatePtBr } from "@/lib/date-utils";
import { StatusBadge } from "@/pages/equipamentos/EquipamentosStatusBadge";

/**
 * Esta série já passou pela bancada: resumo das passagens anteriores (mais recente primeiro),
 * com o defeito de cada uma e o link para a OS. Criar outro ciclo exige confirmar.
 */
export function HistoricoDoSerial({
  registros,
  confirmado,
  onConfirmar,
  onAbrir,
}: {
  registros: Equipamento[];
  confirmado: boolean;
  onConfirmar: (confirmado: boolean) => void;
  onAbrir: (equipamento: Equipamento) => void;
}) {
  const ordenados = [...registros].sort((a, b) => (b.data_entrada ?? "").localeCompare(a.data_entrada ?? "") || (b.id ?? 0) - (a.id ?? 0));
  const vezes = ordenados.length === 1 ? "1 vez" : `${ordenados.length} vezes`;
  return (
    <section aria-label="Passagens anteriores desta série" className="mt-2 space-y-3 rounded-xl border border-status-wait bg-status-wait-bg p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-status-wait">
        <History className="h-4 w-4 shrink-0" aria-hidden="true" />
        Esta série já passou aqui {vezes}.
      </p>
      <ul className="space-y-2">
        {ordenados.map((r) => (
          <li key={r.id} className="rounded-lg bg-card px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold tabular-nums">OS #{r.id}</span>
              <StatusBadge status={r.status} />
              <span className="text-muted-foreground">
                Entrada {formatDatePtBr(r.data_entrada)}
                {r.data_saida ? ` · saída ${formatDatePtBr(r.data_saida)}` : ""}
              </span>
              {r.id != null && (
                <button type="button" onClick={() => onAbrir(r)} className="ml-auto font-semibold text-primary underline-offset-2 hover:underline">
                  Ver OS
                </button>
              )}
            </div>
            {r.defeito_relatado?.trim() && (
              <p className="mt-1 line-clamp-2 text-muted-foreground">Defeito: {r.defeito_relatado.trim()}</p>
            )}
          </li>
        ))}
      </ul>
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(event) => onConfirmar(event.target.checked)}
          className="mt-0.5 rounded border-status-wait"
        />
        <span>
          <span className="font-semibold text-status-wait">Criar um novo ciclo de manutenção para este equipamento.</span>{" "}
          <span className="text-muted-foreground">O histórico anterior continua como está.</span>
        </span>
      </label>
    </section>
  );
}
