import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { OrcamentoInsumosDetalhe } from "@/types";

/**
 * Venda de insumos aberta no Balcão para entrega. Entregar usa o mesmo comando de
 * Vendas de insumos (marcar_orcamento_insumos_entregue); a permissão fica no backend.
 */
export function useVendaRetirada(vendaId: number) {
  const [venda, setVenda] = useState<OrcamentoInsumosDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVenda(await db.obterOrcamentoInsumos(vendaId));
    } catch (causa) {
      setError(typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa));
    } finally {
      setLoading(false);
    }
  }, [vendaId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Devolve null se deu certo, ou o texto do erro do backend. */
  const entregar = useCallback(async (): Promise<string | null> => {
    if (!venda) return "Venda não carregada.";
    try {
      setVenda(await db.marcarOrcamentoInsumosEntregue(venda.id, venda.atualizado_em));
      return null;
    } catch (causa) {
      return typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa);
    }
  }, [venda]);

  return { venda, loading, error, recarregar: carregar, entregar };
}
