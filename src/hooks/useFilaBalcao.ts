import { useCallback, useEffect, useRef, useState } from "react";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
import { db } from "@/lib/db";
import { todayLocalIsoDate } from "@/lib/date-utils";
import { juntarFilaRetirada, type ItemRetirada } from "@/lib/retirada-balcao";
import type { Equipamento } from "@/types";

/**
 * Fila do dia do Balcão: o que está pronto para retirada (equipamentos prontos e
 * vendas de insumos aprovadas) e o que chegou hoje.
 * Usa só a listagem paginada que já existe (10 por página): "chegaram hoje"
 * olha as 10 entradas mais recentes, então `chegaramHojeMais` avisa quando
 * todas eram de hoje e pode haver mais.
 */
export function useFilaBalcao() {
  const [prontos, setProntos] = useState<ItemRetirada[]>([]);
  const [totalProntos, setTotalProntos] = useState(0);
  const [chegaramHoje, setChegaramHoje] = useState<Equipamento[]>([]);
  const [chegaramHojeMais, setChegaramHojeMais] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pedido = useRef(0);
  const cargaVisivelPendente = useRef(false);
  // Mudança chegou durante a carga visível: o SELECT dela pode ter rodado antes do COMMIT remoto.
  const recargaPendente = useRef(false);

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (silencioso && cargaVisivelPendente.current) {
      recargaPendente.current = true;
      return;
    }
    const meu = ++pedido.current;
    if (!silencioso) {
      cargaVisivelPendente.current = true;
      setLoading(true);
      setError(null);
    }
    try {
      const [paginaProntos, recentes, vendasAprovadas] = await Promise.all([
        db.listarEquipamentosPaginados(undefined, "PRONTO", 0, "ATUALIZACAO_RECENTE", undefined, silencioso),
        db.listarEquipamentosPaginados(undefined, undefined, 0, "CADASTRO_RECENTE", undefined, silencioso),
        // Sem vendas (falha ou perfil sem acesso), a fila continua com os equipamentos.
        Promise.resolve()
          .then(() => db.listarOrcamentosInsumos({ status: "APROVADO", page: 0 }, silencioso))
          .catch(() => null),
      ]);
      if (meu !== pedido.current) return;
      setError(null);
      const hoje = todayLocalIsoDate();
      const itensRecentes = recentes?.items ?? [];
      const deHoje = itensRecentes.filter((eq) => eq.data_entrada === hoje);
      setProntos(juntarFilaRetirada(paginaProntos?.items ?? [], vendasAprovadas?.items ?? []));
      setTotalProntos((paginaProntos?.total ?? 0) + (vendasAprovadas?.total ?? 0));
      setChegaramHoje(deHoje);
      setChegaramHojeMais(itensRecentes.length > 0 && deHoje.length === itensRecentes.length && (recentes?.total ?? 0) > itensRecentes.length);
    } catch (e) {
      if (meu === pedido.current && !silencioso) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (meu === pedido.current) {
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
      ++pedido.current;
      cargaVisivelPendente.current = false;
      recargaPendente.current = false;
    };
  }, [carregar]);

  useAtualizacaoAoVivo(["equipamentos", "orcamentos_insumos", "clientes"], () => {
    void carregar({ silencioso: true });
  });

  return { prontos, totalProntos, chegaramHoje, chegaramHojeMais, loading, error, recarregar: carregar };
}
