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
import { argSegundoPlano } from "@/lib/ao-vivo";
import { useAtualizacaoAoVivo, useDestaquesAoVivo } from "@/hooks/useAtualizacaoAoVivo";
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
  /** Total por situação (pílulas do filtro); null se a contagem falhar. */
  const [contagens, setContagens] = useState<Record<string, number> | null>(null);

  const carregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    // Atualização ao vivo recarrega sem "carregando": a lista fica e só o que mudou troca.
    if (opcoes?.silencioso !== true) setLoading(true);
    setError(null);
    try {
      const contagem = Promise.resolve().then(() => db.contarOrcamentosInsumosPorStatus(params.busca, ...argSegundoPlano(opcoes?.silencioso === true))).catch(() => null);
      const resultado = await db.listarOrcamentosInsumos({
        busca: params.busca,
        status: params.status,
        page: Math.max((params.page ?? 1) - 1, 0),
      }, ...argSegundoPlano(opcoes?.silencioso === true));
      setContagens(await contagem);
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

  // Outro computador mudou algo desta lista: recarrega em silêncio e destaca o que mudou.

  const { destaques, lembrar } = useDestaquesAoVivo(orcamentos, (item) => item.id, (item) => JSON.stringify(item));

  useAtualizacaoAoVivo(["orcamentos_insumos"], () => {

    lembrar();

    void carregar({ silencioso: true });

  });

  return { orcamentos, total, contagens, loading, error, recarregar: carregar, destaques };
}
