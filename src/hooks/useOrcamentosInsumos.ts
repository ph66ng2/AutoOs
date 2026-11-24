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
import { useCallback, useEffect, useState, useLayoutEffect, useRef } from "react";
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

  const requestIdRef = useRef(0);
  const carregouUmaVez = useRef(false);
  const cargaVisivelPendente = useRef(false);
  // Mudança chegou durante a carga visível: o SELECT dela pode ter rodado antes do COMMIT remoto.
  const recargaPendente = useRef(false);
  const mountedRef = useRef(false);
  const paramsRef = useRef(params);

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useLayoutEffect(() => {
    paramsRef.current = params;
    requestIdRef.current += 1;
  }, [params.busca, params.status, params.page, params.criadoPor, params.perfilId]);

  const carregar = useCallback(async (opcoes?: { silencioso?: boolean }) => {
    if (!mountedRef.current) return;
    const silencioso = opcoes?.silencioso === true;
    if (silencioso && cargaVisivelPendente.current) {
      recargaPendente.current = true;
      return;
    }
    const requestId = ++requestIdRef.current;
    const atual = () => mountedRef.current && requestIdRef.current === requestId;
    if (!silencioso) {
      cargaVisivelPendente.current = true;
      setLoading(true);
      setError(null);
    }
    try {
      const params = paramsRef.current;
      const criadoPor = params.criadoPor ?? null;
      const contagem = Promise.resolve().then(() => (criadoPor ? db.contarOrcamentosInsumosPorStatus(params.busca, silencioso, criadoPor) : db.contarOrcamentosInsumosPorStatus(params.busca, ...argSegundoPlano(silencioso)))).catch(() => null);
      const minhas = params.perfilId
        ? Promise.resolve().then(() => db.listarOrcamentosInsumos({ criado_por_profile_id: params.perfilId, page: 0 }, ...argSegundoPlano(silencioso))).then((r) => r.total).catch(() => null)
        : Promise.resolve(0);
      const resultado = await db.listarOrcamentosInsumos({
        busca: params.busca,
        status: params.status,
        page: Math.max((params.page ?? 1) - 1, 0),
        ...(criadoPor ? { criado_por_profile_id: criadoPor } : {}),
      }, ...argSegundoPlano(silencioso));
      const [numeros, totalDoPerfil] = await Promise.all([contagem, minhas]);
      if (!atual()) return;
      carregouUmaVez.current = true;
      setError(null);
      setContagens(numeros);
      setMinhasTotal(totalDoPerfil);
      setOrcamentos(resultado.items);
      setTotal(resultado.total);
    } catch (err: unknown) {
      if (!atual() || (silencioso && carregouUmaVez.current)) return;
      setError(String(err) || "Erro ao carregar orçamentos de insumos");
      console.error("Erro ao carregar orçamentos de insumos:", err);
    } finally {
      if (atual()) {
        cargaVisivelPendente.current = false;
        setLoading(false);
        if (!silencioso && recargaPendente.current) {
          recargaPendente.current = false;
          void carregar({ silencioso: true });
        }
      }
    }
  }, []);

  useEffect(() => {
    void carregar();
    return () => {
      requestIdRef.current += 1;
      cargaVisivelPendente.current = false;
      recargaPendente.current = false;
    };
  }, [carregar, params.busca, params.status, params.page, params.criadoPor, params.perfilId]);

  // Outro computador mudou algo desta lista: recarrega em silêncio e destaca o que mudou.

  const { destaques, lembrar } = useDestaquesAoVivo(orcamentos, (item) => item.id, (item) => JSON.stringify(item));

  useAtualizacaoAoVivo(["orcamentos_insumos"], () => {

    if (cargaVisivelPendente.current) {

      recargaPendente.current = true;

      return;

    }
    lembrar();

    void carregar({ silencioso: true });

  });

  return { orcamentos, total, contagens, minhasTotal, loading, error, recarregar: carregar, destaques };
}
