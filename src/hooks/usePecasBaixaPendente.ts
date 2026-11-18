import { useEffect, useState } from "react";
import { db } from "@/lib/db";

/** Peças da OS com baixa pendente, como "servicoId:produtoId" (selo na aba Orçamento). Falha vira conjunto vazio. */
export function usePecasBaixaPendente(equipamentoId?: number, recarga?: unknown) {
  const [pendentes, setPendentes] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!equipamentoId) {
      setPendentes(new Set());
      return;
    }
    let ativo = true;
    Promise.resolve()
      .then(() => db.listarPecasBaixaPendente(equipamentoId))
      .then((linhas) => { if (ativo) setPendentes(new Set(linhas.map((l) => `${l.servico_id}:${l.produto_id}`))); })
      .catch(() => { if (ativo) setPendentes(new Set()); });
    return () => { ativo = false; };
  }, [equipamentoId, recarga]);
  return pendentes;
}
