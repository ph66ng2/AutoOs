import { cn } from "@/lib/utils";

export interface EtapaDaBarra {
  rotulo: string;
  /** "dd/mm" ou "dd/mm · pessoa"; vazio nas etapas não alcançadas. */
  detalhe?: string;
  estado: "feita" | "atual" | "futura";
  /** Cor cheia da etapa atual (família do status). */
  cor?: string;
}

/**
 * Barra de etapas de Detalhes da OS e da venda (decisão 25): traço, nome e data de cada
 * etapa alcançada. Feitas em primary, a atual na cor da família, as futuras em track.
 */
export function BarraEtapas({ etapas, rotulo, className }: { etapas: EtapaDaBarra[]; rotulo: string; className?: string }) {
  return (
    <ol
      aria-label={rotulo}
      className={cn("grid gap-x-3 gap-y-4", etapas.length > 4 ? "grid-cols-3 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-4", className)}
    >
      {etapas.map((etapa) => (
        <li key={etapa.rotulo} aria-current={etapa.estado === "atual" ? "step" : undefined} className="min-w-0">
          <span
            aria-hidden="true"
            className={cn("block h-1.5 rounded-full", etapa.estado === "feita" ? "bg-primary" : etapa.estado === "atual" ? etapa.cor : "bg-track")}
          />
          <span className={cn("mt-2 block truncate text-[13px] font-semibold", etapa.estado === "futura" && "text-muted-foreground")}>
            {etapa.rotulo}
          </span>
          {/* Reserva a linha da data mesmo vazia: a barra não muda de altura entre situações. */}
          <span className="block min-h-4 truncate text-xs tabular-nums text-muted-foreground">{etapa.detalhe ?? ""}</span>
        </li>
      ))}
    </ol>
  );
}
