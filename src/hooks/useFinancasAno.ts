import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { argSegundoPlano } from "@/lib/ao-vivo";
import { useAtualizacaoAoVivo } from "@/hooks/useAtualizacaoAoVivo";
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
  const [mesesLidos, setMeses] = useState<Omit<MesFinancas, "fixo">[]>([]);
  const [anteriorLido, setAnterior] = useState<Omit<MesFinancas, "fixo">[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pedido = useRef(0);
  const carregouUmaVez = useRef(false);
  const cargaVisivelPendente = useRef(false);
  // Mudança chegou durante a carga visível: o SELECT dela pode ter rodado antes do COMMIT remoto.
  const recargaPendente = useRef(false);
  const [tick, setTick] = useState(0);
  const recarregar = useCallback(() => setTick((n) => n + 1), []);
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

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
    const lista = [ano - 1, ano].flatMap((a) => Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, ano: a })));
    const futuro = (m: { mes: number; ano: number }) => m.ano > anoAtual || (m.ano === anoAtual && m.mes > mesAtual);
    try {
      const [receita, resumos] = await Promise.all([
        // Todas as OS aprovadas no período (sem o limite de 50 da lista). Um ano a mais de cada
        // lado: `data_aprovacao` com hora pode cair em outro ano no fuso local.
        db.listarReceitaAprovada(ano - 2, ano + 1, ...argSegundoPlano(silencioso)).then(receitaPorMes).catch(() => null),
        Promise.all(
          lista.map(async (m) => {
            if (futuro(m)) return { ok: true as const, total_variavel: 0 };
            try {
              const resumo = await db.resumoMensal(m.mes, m.ano, ...argSegundoPlano(silencioso));
              return { ok: true as const, total_variavel: resumo?.total_variavel ?? 0 };
            } catch {
              return { ok: false as const, total_variavel: 0 };
            }
          }),
        ),
      ]);
      if (meu !== pedido.current) return;
      const preservarDados = silencioso && carregouUmaVez.current;
      if (preservarDados && receita == null) return;
      if (resumos.some((item) => !item.ok)) {
        if (preservarDados) return;
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
          variavel: ehFuturo ? 0 : resumos[indice].total_variavel,
        };
      });
      if (receita != null) carregouUmaVez.current = true;
      setAnterior(todos.slice(0, 12));
      setMeses(todos.slice(12));
      setError(receita == null ? "Não foi possível carregar o faturado." : null);
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
  }, [ano, anoAtual, mesAtual]);

  useEffect(() => {
    void carregar();
    return () => {
      ++pedido.current;
      cargaVisivelPendente.current = false;
      recargaPendente.current = false;
    };
  }, [carregar, tick]);

  useAtualizacaoAoVivo(["equipamentos", "verificacoes", "gastos_variaveis"], () => {
    void carregar({ silencioso: true });
  });

  // O total atual dos fixos vem da lista de gastos. Uma mudança nele recalcula os saldos
  // sem disparar outra leitura do ano ou renovar a sessão.
  const meses = useMemo(() => mesesLidos.map((m) => ({ ...m, fixo: m.futuro ? 0 : totalFixo })), [mesesLidos, totalFixo]);
  const anterior = useMemo(() => anteriorLido.map((m) => ({ ...m, fixo: m.futuro ? 0 : totalFixo })), [anteriorLido, totalFixo]);
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
