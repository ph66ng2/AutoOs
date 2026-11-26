import { useCallback, useEffect, useRef, useState } from "react";
import { argSegundoPlano } from "@/lib/ao-vivo";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { db } from "@/lib/db";
import type { OrcamentoInsumosDetalhe } from "@/types";

/**
 * Um orçamento de insumos (OI-n), para a página /vendas/:id. Recarrega em silêncio quando
 * outro computador muda o orçamento, o estoque dos produtos ou o cliente.
 */
export function useVendaInsumos(id: number | null) {
  const [venda, setVenda] = useState<OrcamentoInsumosDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Só a busca mais recente pode mexer no estado: voltar/avançar entre /vendas/:id com uma
  // busca pendente não deixa a resposta do orçamento anterior sobrescrever o atual.
  const ultimaBusca = useRef(0);
  const cargaVisivelPendente = useRef(false);
  // Mudança chegou durante a carga visível: o SELECT dela pode ter rodado antes do COMMIT remoto.
  const recargaPendente = useRef(false);

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (id == null) {
      if (silencioso) return;
      ++ultimaBusca.current;
      cargaVisivelPendente.current = false;
      recargaPendente.current = false;
      setVenda(null);
      setLoading(false);
      setError("Orçamento não encontrado.");
      return;
    }
    if (silencioso && cargaVisivelPendente.current) {
      recargaPendente.current = true;
      return;
    }
    const busca = ++ultimaBusca.current;
    const vale = () => busca === ultimaBusca.current;
    if (!silencioso) {
      cargaVisivelPendente.current = true;
      setLoading(true);
      setError(null);
    }
    try {
      const detalhe = await db.obterOrcamentoInsumos(id, ...argSegundoPlano(silencioso));
      if (!vale()) return;
      setVenda(detalhe);
      setError(null);
    } catch (causa) {
      // Falha da recarga silenciosa não troca a tela: o orçamento já carregado continua.
      if (!vale() || silencioso) return;
      setError(typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa));
    } finally {
      if (vale()) {
        cargaVisivelPendente.current = false;
        setLoading(false);
        if (!silencioso && recargaPendente.current) {
          recargaPendente.current = false;
          void carregar({ silencioso: true });
        }
      }
    }
  }, [id]);

  useEffect(() => {
    void carregar();
    return () => {
      ++ultimaBusca.current;
      cargaVisivelPendente.current = false;
      recargaPendente.current = false;
    };
  }, [carregar]);

  useAtualizacaoAoVivo(["orcamentos_insumos", "produtos", "clientes", "cliente_contatos"], () => {
    void carregar({ silencioso: true });
  });

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
