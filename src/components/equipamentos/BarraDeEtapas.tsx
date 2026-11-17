import { cn } from "@/lib/utils";
import { FAMILIA_COR_CHEIA, TOTAL_ETAPAS_COMPACTAS, etapaCompacta, statusFamilia, type StatusFamilia } from "@/lib/status-familia";

/** Traços de andamento (14×4px) na cor cheia da família. Base da barra compacta de qualquer lista. */
export function TracosDeEtapas({ feitas, total, familia, className }: { feitas: number; total: number; familia: StatusFamilia; className?: string }) {
  const cor = FAMILIA_COR_CHEIA[familia];
  return (
    <span className={cn("flex gap-0.5", className)} role="img" aria-label={`Etapa ${feitas} de ${total}`}>
      {Array.from({ length: total }, (_, indice) => (
        <span key={indice} className={cn("h-1 w-3.5 rounded-sm", indice < feitas ? cor : "bg-track")} />
      ))}
    </span>
  );
}

/** Barra compacta de andamento (lista de equipamentos): 7 traços na cor da família. */
export function BarraDeEtapas({ status, className }: { status: string; className?: string }) {
  return (
    <TracosDeEtapas
      feitas={etapaCompacta(status)}
      total={TOTAL_ETAPAS_COMPACTAS}
      familia={statusFamilia(status)}
      className={className}
    />
  );
}
