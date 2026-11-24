import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";

const SEM_PENDENCIAS = new Set<string>();

/** Peças da OS com baixa pendente, como "servicoId:produtoId" (selo na aba Orçamento). Falha vira conjunto vazio. */
export function usePecasBaixaPendente(equipamentoId?: number) {
  const [cache, setCache] = useState<{ id: number; pendentes: Set<string> } | null>(null);
  const pedido = useRef(0);
  const cargaVisivelPendente = useRef(false);
  // Mudança chegou durante a carga visível: o SELECT dela pode ter rodado antes do COMMIT remoto.
  const recargaPendente = useRef(false);
  const idAtual = useRef(equipamentoId);
  idAtual.current = equipamentoId;

  const recarregar = useCallback(async (segundoPlano = false) => {
    if (!equipamentoId || equipamentoId !== idAtual.current) return;
    if (segundoPlano && cargaVisivelPendente.current) {
      recargaPendente.current = true;
      return;
    }
    const meu = ++pedido.current;
    if (!segundoPlano) cargaVisivelPendente.current = true;
    try {
      const linhas = await db.listarPecasBaixaPendente(equipamentoId, segundoPlano);
      if (meu === pedido.current && equipamentoId === idAtual.current) {
        setCache({ id: equipamentoId, pendentes: new Set(linhas.map((l) => `${l.servico_id}:${l.produto_id}`)) });
      }
    } catch {
      if (meu === pedido.current && equipamentoId === idAtual.current) setCache(null);
    } finally {
      if (meu === pedido.current && equipamentoId === idAtual.current) {
        cargaVisivelPendente.current = false;
        if (!segundoPlano && recargaPendente.current) {
          recargaPendente.current = false;
          void recarregar(true);
        }
      }
    }
  }, [equipamentoId]);

  useEffect(() => {
    setCache(null);
    void recarregar();
    return () => {
      ++pedido.current;
      cargaVisivelPendente.current = false;
      recargaPendente.current = false;
    };
  }, [recarregar]);

  return { pendentes: cache && cache.id === equipamentoId ? cache.pendentes : SEM_PENDENCIAS, recarregar };
}
