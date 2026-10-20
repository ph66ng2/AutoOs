/**
 * @file useOrcamentosInsumos.ts
 *
 * Lista paginada dos orçamentos de venda avulsa de insumos (OI-<n>) da empresa.
 * Segue o padrão dos hooks de domínio: estado local, `carregar` por `useCallback`,
 * recarga automática quando os filtros mudam e `recarregar` para depois de uma alteração.
 *
 * As ações (criar, aprovar, cancelar...) são chamadas direto em `db` pelo diálogo, porque
 * dependem do token de concorrência do orçamento aberto; o diálogo avisa a lista por `recarregar`.
 */
import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { OrcamentoInsumos, StatusOrcamentoInsumos } from "@/types";

interface UseOrcamentosInsumosParams {
  busca?: string;
  status?: StatusOrcamentoInsumos | "TODOS";
  /** Página apresentada pela interface, iniciando em 1. */
  page?: number;
}

export function useOrcamentosInsumos(params: UseOrcamentosInsumosParams = {}) {
  const [orcamentos, setOrcamentos] = useState<OrcamentoInsumos[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resultado = await db.listarOrcamentosInsumos({
        busca: params.busca,
        status: params.status,
        page: Math.max((params.page ?? 1) - 1, 0),
      });
      setOrcamentos(resultado.items);
      setTotal(resultado.total);
    } catch (err: unknown) {
      setError(String(err) || "Erro ao carregar orçamentos de insumos");
      console.error("Erro ao carregar orçamentos de insumos:", err);
    } finally {
      setLoading(false);
    }
  }, [params.busca, params.status, params.page]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { orcamentos, total, loading, error, recarregar: carregar };
}
