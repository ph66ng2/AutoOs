import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";
import type { OrcamentoInsumosDetalhe } from "@/types";

/** Um orçamento de insumos (OI-n), para a página /vendas/:id. */
export function useVendaInsumos(id: number | null) {
  const [venda, setVenda] = useState<OrcamentoInsumosDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Só a busca mais recente pode mexer no estado: voltar/avançar entre /vendas/:id com uma
  // busca pendente não deixa a resposta do orçamento anterior sobrescrever o atual.
  const ultimaBusca = useRef(0);

  const carregar = useCallback(async () => {
    const busca = ++ultimaBusca.current;
    if (id == null) {
      setVenda(null);
      setLoading(false);
      setError("Orçamento não encontrado.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detalhe = await db.obterOrcamentoInsumos(id);
      if (busca !== ultimaBusca.current) return;
      setVenda(detalhe);
    } catch (causa) {
      if (busca !== ultimaBusca.current) return;
      setError(typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa));
    } finally {
      if (busca === ultimaBusca.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Enquanto o novo id carrega, o orçamento anterior não aparece (as ações usariam o id errado).
  const vendaAtual = venda != null && venda.id === id ? venda : null;
  const carregandoOutro = venda != null && venda.id !== id && error == null;

  return { venda: vendaAtual, loading: loading || carregandoOutro, error, recarregar: carregar };
}

/**
 * Busca a versão atual de um orçamento, para os modais de ação (AcaoVendaDialog): cada ação
 * parte do que está no banco agora, não de uma cópia que outra estação pode ter mudado.
 */
export function useBuscarVendaInsumos() {
  return useCallback((id: number) => db.obterOrcamentoInsumos(id), []);
}
