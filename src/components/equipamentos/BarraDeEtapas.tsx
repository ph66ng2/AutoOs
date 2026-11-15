import { cn } from "@/lib/utils";
import { FAMILIA_COR_CHEIA, TOTAL_ETAPAS_COMPACTAS, etapaCompacta, statusFamilia } from "@/lib/status-familia";

/** Barra compacta de andamento (lista de equipamentos): 7 traços de 14×4px na cor da família. */
export function BarraDeEtapas({ status, className }: { status: string; className?: string }) {
  const feitas = etapaCompacta(status);
  const cor = FAMILIA_COR_CHEIA[statusFamilia(status)];
  return (
    <span
      className={cn("flex gap-0.5", className)}
      role="img"
      aria-label={`Etapa ${feitas} de ${TOTAL_ETAPAS_COMPACTAS}`}
    >
      {Array.from({ length: TOTAL_ETAPAS_COMPACTAS }, (_, indice) => (
        <span key={indice} className={cn("h-1 w-3.5 rounded-sm", indice < feitas ? cor : "bg-track")} />
      ))}
    </span>
  );
}
