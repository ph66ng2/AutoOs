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
  /** "Minhas": só os orçamentos criados por este perfil. */
  criadoPor?: number | null;
  /** Perfil da sessão: conta quantos orçamentos ele criou (a pílula "Minhas" só aparece com algum). */
  perfilId?: number | null;
}

export function useOrcamentosInsumos(params: UseOrcamentosInsumosParams = {}) {
  const [orcamentos, setOrcamentos] = useState<OrcamentoInsumos[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Total por situação (pílulas do filtro); null se a contagem falhar. */
  const [contagens, setContagens] = useState<Record<string, number> | null>(null);
  /** Orçamentos criados pelo perfil da sessão (todas as situações); null enquanto não sabe. */
  const [minhasTotal, setMinhasTotal] = useState<number | null>(null);

  const carregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    // Atualização ao vivo recarrega sem "carregando": a lista fica e só o que mudou troca.
    if (opcoes?.silencioso !== true) setLoading(true);
    setError(null);
    try {
      const segundoPlano = opcoes?.silencioso === true;
      const criadoPor = params.criadoPor ?? null;
      const contagem = Promise.resolve().then(() => (criadoPor ? db.contarOrcamentosInsumosPorStatus(params.busca, segundoPlano, criadoPor) : db.contarOrcamentosInsumosPorStatus(params.busca, ...argSegundoPlano(segundoPlano)))).catch(() => null);
      const minhas = params.perfilId
        ? Promise.resolve().then(() => db.listarOrcamentosInsumos({ criado_por_profile_id: params.perfilId, page: 0 }, ...argSegundoPlano(segundoPlano))).then((r) => r.total).catch(() => null)
        : Promise.resolve(0);
      const resultado = await db.listarOrcamentosInsumos({
        busca: params.busca,
        status: params.status,
        page: Math.max((params.page ?? 1) - 1, 0),
        ...(criadoPor ? { criado_por_profile_id: criadoPor } : {}),
      }, ...argSegundoPlano(segundoPlano));
      setContagens(await contagem);
      setMinhasTotal(await minhas);
      setOrcamentos(resultado.items);
      setTotal(resultado.total);
    } catch (err: unknown) {
      setError(String(err) || "Erro ao carregar orçamentos de insumos");
      console.error("Erro ao carregar orçamentos de insumos:", err);
    } finally {
      setLoading(false);
    }
  }, [params.busca, params.status, params.page, params.criadoPor, params.perfilId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Outro computador mudou algo desta lista: recarrega em silêncio e destaca o que mudou.

  const { destaques, lembrar } = useDestaquesAoVivo(orcamentos, (item) => item.id, (item) => JSON.stringify(item));

  useAtualizacaoAoVivo(["orcamentos_insumos"], () => {

    lembrar();

    void carregar({ silencioso: true });

  });

  return { orcamentos, total, contagens, minhasTotal, loading, error, recarregar: carregar, destaques };
}
