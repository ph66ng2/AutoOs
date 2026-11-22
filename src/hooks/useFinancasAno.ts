import { useCallback, useEffect, useState } from "react";
import { db } from "@/lib/db";
import { receitaPorMes } from "@/hooks/useReceitaPorMes";
import type { GastoFixo, GastoVariavel } from "@/types";

export interface MesFinancas {
  /** 1 a 12. */
  mes: number;
  ano: number;
  faturado: number;
  fixo: number;
  variavel: number;
  /** Mês que ainda não chegou: fica vazio no gráfico. */
  futuro: boolean;
}

/**
 * Finanças de um ano e do anterior, mês a mês: faturado (orçamentos aprovados, mesmo cálculo
 * que o Início fazia), gastos variáveis do resumo mensal e o total dos fixos ativos. O app não
 * guarda histórico dos fixos, então todo mês passado usa o total de hoje, como o gráfico antigo.
 */
export function useFinancasAno(ano: number, totalFixo: number, hoje = new Date()) {
  const [meses, setMeses] = useState<MesFinancas[]>([]);
  const [anterior, setAnterior] = useState<MesFinancas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const recarregar = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    let ativo = true;
    setLoading(true);
    setError(null);
    const lista = [ano - 1, ano].flatMap((a) => Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ano: a })));
    const futuro = (m: { mes: number; ano: number }) => m.ano > anoAtual || (m.ano === anoAtual && m.mes > mesAtual);
    void (async () => {
      try {
        const [receita, resumos] = await Promise.all([
          // Todas as OS aprovadas no período (sem o limite de 50 da lista). Um ano a mais de cada
          // lado: `data_aprovacao` com hora pode cair em outro ano no fuso local.
          db.listarReceitaAprovada(ano - 2, ano + 1).then(receitaPorMes).catch(() => null),
          Promise.all(
            lista.map(async (m) => {
              if (futuro(m)) return { ok: true as const, total_variavel: 0 };
              try {
                const resumo = await db.resumoMensal(m.mes, m.ano);
                return { ok: true as const, total_variavel: resumo?.total_variavel ?? 0 };
              } catch {
                return { ok: false as const, total_variavel: 0 };
              }
            }),
          ),
        ]);
        if (!ativo) return;
        if (resumos.some((item) => !item.ok)) {
          setAnterior([]);
          setMeses([]);
          setError("Não foi possível carregar os gastos de alguns meses.");
          return;
        }
        const porChave = new Map((receita ?? []).map((item) => [item.chave, item.valor]));
        const todos = lista.map((m, indice) => {
          const ehFuturo = futuro(m);
          return {
            ...m,
            futuro: ehFuturo,
            faturado: ehFuturo ? 0 : porChave.get(`${m.ano}-${String(m.mes).padStart(2, "0")}`) ?? 0,
            fixo: ehFuturo ? 0 : totalFixo,
            variavel: ehFuturo ? 0 : resumos[indice].total_variavel,
          };
        });
        setAnterior(todos.slice(0, 12));
        setMeses(todos.slice(12));
        if (receita == null) setError("Não foi possível carregar o faturado.");
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [ano, totalFixo, anoAtual, mesAtual, tick]);

  return { meses, anterior, loading, error, recarregar };
}

function campoCsv(valor: unknown) {
  const texto = valor == null ? "" : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Baixa os lançamentos do mês em CSV, na pasta temporária do app (como a auditoria). Devolve o nome. */
export function useExportarLancamentos() {
  return useCallback(async (mes: number, ano: number, fixos: GastoFixo[], variaveis: GastoVariavel[]) => {
    const linhas = [
      ["tipo", "descricao", "categoria", "data ou vencimento", "valor"].map(campoCsv).join(","),
      ...fixos
        .filter((g) => g.ativo !== false)
        .map((g) => ["fixo", g.nome, g.categoria, g.vencimento_dia ? `dia ${g.vencimento_dia}` : "", g.valor.toFixed(2)].map(campoCsv).join(",")),
      ...variaveis.map((g) => ["variável", g.descricao, g.categoria, g.data, g.valor.toFixed(2)].map(campoCsv).join(",")),
    ];
    const nome = `financas-${ano}-${String(mes).padStart(2, "0")}.csv`;
    await db.salvarArquivoTemp(Array.from(new TextEncoder().encode(`﻿${linhas.join("\n")}`)), nome);
    return nome;
  }, []);
}
