import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { OrcamentoInsumosDetalhe } from "@/types";

/** Um orçamento de insumos (OI-n), para a página /vendas/:id. */
export function useVendaInsumos(id: number | null) {
  const [venda, setVenda] = useState<OrcamentoInsumosDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (id == null) {
      setLoading(false);
      setError("Orçamento não encontrado.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setVenda(await db.obterOrcamentoInsumos(id));
    } catch (causa) {
      setError(typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { venda, loading, error, recarregar: carregar };
}
