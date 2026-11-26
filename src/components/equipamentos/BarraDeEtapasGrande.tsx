import { BarraEtapas } from "@/components/detalhe/BarraEtapas";
import { etapasDaOs } from "@/lib/etapas-os";
import type { EquipamentoHistoricoEvento } from "@/types";

/**
 * Barra grande de andamento (Detalhes da OS): 6 etapas com "dd/mm · pessoa" tirados do
 * histórico de status. É a mesma barra da página da venda (decisão 25).
 */
export function BarraDeEtapasGrande({
  status,
  historico,
  className,
}: {
  status: string;
  historico?: EquipamentoHistoricoEvento[];
  className?: string;
}) {
  return <BarraEtapas rotulo="Andamento da OS" etapas={etapasDaOs(status, historico)} className={className} />;
}
