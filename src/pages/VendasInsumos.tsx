import { PageHeader } from "@/components/PageHeader";
import { useResumoEstoque } from "@/hooks/useResumoEstoque";
import { OrcamentosInsumosTab } from "@/pages/insumos/OrcamentosInsumosTab";

/**
 * Vendas de insumos: orçamentos de etiquetas, ribbons e peças sem equipamento em
 * manutenção (OI-n). Saiu de "Insumos e peças" para não se confundir com o
 * orçamento da OS; o estoque continua lá.
 */
export default function VendasInsumos() {
  const { resumo, recarregar } = useResumoEstoque();
  const abertos = resumo?.orcamentosAbertos;
  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Vendas de insumos"
        descricao={abertos != null ? `${abertos} ${abertos === 1 ? "orçamento aberto" : "orçamentos abertos"}` : undefined}
      />
      <OrcamentosInsumosTab contagemPorStatus={resumo?.orcamentosPorStatus} onEstoqueAlterado={() => void recarregar()} />
    </div>
  );
}
