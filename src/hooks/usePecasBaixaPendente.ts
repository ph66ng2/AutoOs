import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/db";

const SEM_PENDENCIAS = new Set<string>();

/** Peças da OS com baixa pendente, como "servicoId:produtoId" (selo na aba Orçamento). Falha vira conjunto vazio. */
export function usePecasBaixaPendente(equipamentoId?: number) {
  const [cache, setCache] = useState<{ id: number; pendentes: Set<string> } | null>(null);
  const pedido = useRef(0);
  const idAtual = useRef(equipamentoId);
  idAtual.current = equipamentoId;

  const recarregar = useCallback(async (segundoPlano = false) => {
    if (!equipamentoId || equipamentoId !== idAtual.current) return;
    const meu = ++pedido.current;
    try {
      const linhas = await db.listarPecasBaixaPendente(equipamentoId, segundoPlano);
      if (meu === pedido.current && equipamentoId === idAtual.current) {
        setCache({ id: equipamentoId, pendentes: new Set(linhas.map((l) => `${l.servico_id}:${l.produto_id}`)) });
      }
    } catch {
      if (meu === pedido.current && equipamentoId === idAtual.current) setCache(null);
    }
  }, [equipamentoId]);

  useEffect(() => {
    setCache(null);
    void recarregar();
    return () => { pedido.current += 1; };
  }, [recarregar]);

  return { pendentes: cache && cache.id === equipamentoId ? cache.pendentes : SEM_PENDENCIAS, recarregar };
}
