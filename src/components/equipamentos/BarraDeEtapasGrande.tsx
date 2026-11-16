import { cn } from "@/lib/utils";
import { ETAPAS_OS, FAMILIA_COR_CHEIA, etapaOsAtual, statusFamilia } from "@/lib/status-familia";

/**
 * Barra grande de andamento (Detalhes da OS): 6 etapas. Concluídas em acc, a atual
 * na cor da família do status, as futuras em track. Entregue conclui todas.
 */
export function BarraDeEtapasGrande({ status, className }: { status: string; className?: string }) {
  const atual = etapaOsAtual(status);
  const todasConcluidas = status === "ENTREGUE";
  const corAtual = FAMILIA_COR_CHEIA[statusFamilia(status)];

  return (
    <ol className={cn("grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-6", className)} aria-label="Andamento da OS">
      {ETAPAS_OS.map((etapa, indice) => {
        const concluida = todasConcluidas || indice < atual;
        const eAtual = !todasConcluidas && indice === atual;
        return (
          <li key={etapa} aria-current={eAtual ? "step" : undefined} className="min-w-0">
            <span className={cn("block h-1.5 rounded-full", concluida ? "bg-primary" : eAtual ? corAtual : "bg-track")} />
            <span className={cn("mt-2 block truncate text-[13px] font-semibold", !concluida && !eAtual && "text-muted-foreground")}>
              {etapa}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
