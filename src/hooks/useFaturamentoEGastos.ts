import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { receitaPorMes } from "@/hooks/useReceitaPorMes";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export interface MesFaturamentoEGastos {
  chave: string;
  rotulo: string;
  faturado: number;
  fixo: number;
  variavel: number;
}

/**
 * Os 12 meses até o mês escolhido em Finanças: faturado (orçamentos aprovados, o mesmo
 * cálculo que o Início fazia), gastos variáveis do resumo mensal e o total dos gastos fixos
 * ativos (o app não guarda histórico do fixo; é o mesmo número que o gráfico antigo usava).
 */
export function useFaturamentoEGastos(mes: number, ano: number, totalFixo: number) {
  const [data, setData] = useState<MesFaturamentoEGastos[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setError(null);
    const meses = Array.from({ length: 12 }, (_, indice) => {
      let m = mes - (11 - indice);
      let a = ano;
      while (m <= 0) {
        m += 12;
        a -= 1;
      }
      return { m, a, chave: `${a}-${String(m).padStart(2, "0")}` };
    });
    Promise.all([
      db.listarEquipamentos().then(receitaPorMes).catch(() => null),
      Promise.all(meses.map(({ m, a }) => db.resumoMensal(m, a).catch(() => null))),
    ])
      .then(([receita, resumos]) => {
        if (!ativo) return;
        const porChave = new Map((receita ?? []).map((item) => [item.chave, item.valor]));
        setData(
          meses.map(({ m, a, chave }, indice) => ({
            chave,
            rotulo: m === 1 ? `${MESES[0]}/${String(a).slice(2)}` : MESES[m - 1],
            faturado: porChave.get(chave) ?? 0,
            fixo: totalFixo,
            variavel: resumos[indice]?.total_variavel ?? 0,
          })),
        );
        if (receita == null) setError("Não foi possível carregar o faturado.");
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, [mes, ano, totalFixo]);

  return { data, loading, error };
}
