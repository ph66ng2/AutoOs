import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import type { Equipamento } from "@/types";

export interface ReceitaMes {
  chave: string;
  rotulo: string;
  valor: number;
}

/**
 * Receita aprovada por mês (valor do orçamento, ou o final, na data de aprovação).
 * Mesmo cálculo que o Início fazia; saiu de lá porque o Início não mostra R$.
 */
export function receitaPorMes(equipamentos: ReadonlyArray<Pick<Equipamento, "data_aprovacao" | "valor_orcamento" | "valor_final">>): ReceitaMes[] {
  const mapa = new Map<string, ReceitaMes>();
  for (const eq of equipamentos) {
    if (!eq.data_aprovacao) continue;
    const data = new Date(eq.data_aprovacao.length === 10 ? `${eq.data_aprovacao}T12:00:00` : eq.data_aprovacao);
    if (Number.isNaN(data.getTime())) continue;
    const valor = eq.valor_orcamento ?? eq.valor_final ?? 0;
    if (!valor) continue;
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
    const rotulo = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(data).replace(".", "");
    const atual = mapa.get(chave) ?? { chave, rotulo, valor: 0 };
    atual.valor += valor;
    mapa.set(chave, atual);
  }
  return [...mapa.values()].sort((a, b) => a.chave.localeCompare(b.chave));
}

export function useReceitaPorMes() {
  const [data, setData] = useState<ReceitaMes[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(receitaPorMes(await db.listarEquipamentos()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return { data, loading, error, recarregar: carregar };
}
