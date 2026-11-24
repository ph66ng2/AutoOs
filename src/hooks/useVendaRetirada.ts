import { useCallback, useEffect, useRef, useState } from "react";
import { argSegundoPlano } from "@/lib/ao-vivo";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { db } from "@/lib/db";
import type { OrcamentoInsumosDetalhe } from "@/types";

function textoDoErro(causa: unknown): string {
  return typeof causa === "string" ? causa : String((causa as Error)?.message ?? causa);
}

/**
 * Venda de insumos aberta no Balcão para entrega. Entregar usa o mesmo comando de
 * Vendas de insumos (marcar_orcamento_insumos_entregue); a permissão fica no backend.
 * Recarrega em silêncio quando outro computador cancela, entrega ou muda a venda, o
 * estoque dos produtos ou o cliente (mesmas tabelas de useVendaInsumos).
 */
export function useVendaRetirada(vendaId: number) {
  const [venda, setVenda] = useState<OrcamentoInsumosDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Só a busca mais recente mexe no estado (troca de venda, recarga ao vivo atrasada).
  const ultimaBusca = useRef(0);
  const cargaVisivelPendente = useRef(false);
  // Mudança chegou durante a carga visível: o SELECT dela pode ter rodado antes do COMMIT remoto.
  const recargaPendente = useRef(false);

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
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
      const detalhe = await db.obterOrcamentoInsumos(vendaId, ...argSegundoPlano(silencioso));
      if (!vale()) return;
      setVenda(detalhe);
      setError(null);
    } catch (causa) {
      // Falha da recarga silenciosa não troca a tela: a venda já carregada continua.
      if (!vale() || silencioso) return;
      setError(textoDoErro(causa));
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
  }, [vendaId]);

  useEffect(() => {
    void carregar();
    return () => {
      ++ultimaBusca.current;
      cargaVisivelPendente.current = false;
      recargaPendente.current = false;
    };
  }, [carregar]);

  useAtualizacaoAoVivo(["orcamentos_insumos", "produtos", "clientes"], () => {
    void carregar({ silencioso: true });
  });

  /** Devolve null se deu certo, ou o texto do erro do backend. */
  const entregar = useCallback(async (): Promise<string | null> => {
    if (!venda) return "Venda não carregada.";
    try {
      const entregue = await db.marcarOrcamentoInsumosEntregue(venda.id, venda.atualizado_em);
      // Uma recarga ao vivo iniciada antes da entrega não pode trazer de volta o APROVADO.
      ++ultimaBusca.current;
      cargaVisivelPendente.current = false;
      recargaPendente.current = false;
      setVenda(entregue);
      setLoading(false);
      setError(null);
      return null;
    } catch (causa) {
      return textoDoErro(causa);
    }
  }, [venda]);

  // Enquanto outra venda carrega, a anterior não aparece (a entrega usaria o id errado).
  const vendaAtual = venda != null && venda.id === vendaId ? venda : null;
  const carregandoOutra = venda != null && venda.id !== vendaId && error == null;

  return { venda: vendaAtual, loading: loading || carregandoOutra, error, recarregar: carregar, entregar };
}
