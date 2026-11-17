import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import { todayLocalIsoDate } from "@/lib/date-utils";
import type { Equipamento } from "@/types";

/**
 * Fila do dia do Balcão: o que está pronto para retirada e o que chegou hoje.
 * Usa só a listagem paginada que já existe (10 por página): "chegaram hoje"
 * olha as 10 entradas mais recentes, então `chegaramHojeMais` avisa quando
 * todas eram de hoje e pode haver mais.
 */
export function useFilaBalcao() {
  const [prontos, setProntos] = useState<Equipamento[]>([]);
  const [totalProntos, setTotalProntos] = useState(0);
  const [chegaramHoje, setChegaramHoje] = useState<Equipamento[]>([]);
  const [chegaramHojeMais, setChegaramHojeMais] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [paginaProntos, recentes] = await Promise.all([
        db.listarEquipamentosPaginados(undefined, "PRONTO", 0),
        db.listarEquipamentosPaginados(undefined, undefined, 0, "CADASTRO_RECENTE"),
      ]);
      const hoje = todayLocalIsoDate();
      const itensRecentes = recentes?.items ?? [];
      const deHoje = itensRecentes.filter((eq) => eq.data_entrada === hoje);
      setProntos(paginaProntos?.items ?? []);
      setTotalProntos(paginaProntos?.total ?? 0);
      setChegaramHoje(deHoje);
      setChegaramHojeMais(itensRecentes.length > 0 && deHoje.length === itensRecentes.length && (recentes?.total ?? 0) > itensRecentes.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { prontos, totalProntos, chegaramHoje, chegaramHojeMais, loading, error, recarregar: carregar };
}
