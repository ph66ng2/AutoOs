import type { GastoFixo, GastoVariavel } from "@/types";

export const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** R$ com a opção de ocultar valores (olho no topo de Finanças). */
export function dinheiro(valor: number, ocultar = false): string {
  return ocultar ? "R$ •••••" : moeda.format(valor);
}

/** "+R$ 1.240,00" ou "−R$ 300,00". */
export function dinheiroComSinal(valor: number, ocultar = false): string {
  if (ocultar) return "R$ •••••";
  return `${valor < 0 ? "−" : "+"}${moeda.format(Math.abs(valor))}`;
}

export function totaisDoMes(fixos: GastoFixo[], variaveis: GastoVariavel[]) {
  const fixo = fixos.filter((g) => g.ativo !== false).reduce((soma, g) => soma + (g.valor || 0), 0);
  const variavel = variaveis.reduce((soma, g) => soma + (g.valor || 0), 0);
  return { fixo, variavel, total: fixo + variavel, quantidadeFixos: fixos.filter((g) => g.ativo !== false).length, quantidadeVariaveis: variaveis.length };
}

export interface CategoriaDoMes {
  categoria: string;
  tipo: "fixo" | "variavel";
  valor: number;
}

/** Gastos do mês por categoria e tipo, do maior para o menor ("Folha · fixo", "Fornecedores · variável"). */
export function categoriasDoMes(fixos: GastoFixo[], variaveis: GastoVariavel[]): CategoriaDoMes[] {
  const mapa = new Map<string, CategoriaDoMes>();
  const somar = (categoria: string, tipo: CategoriaDoMes["tipo"], valor: number) => {
    const chave = `${tipo}:${categoria}`;
    const atual = mapa.get(chave) ?? { categoria, tipo, valor: 0 };
    atual.valor += valor || 0;
    mapa.set(chave, atual);
  };
  fixos.filter((g) => g.ativo !== false).forEach((g) => somar(g.categoria, "fixo", g.valor));
  variaveis.forEach((g) => somar(g.categoria, "variavel", g.valor));
  return [...mapa.values()].filter((item) => item.valor > 0).sort((a, b) => b.valor - a.valor);
}

/** Categoria com mais gasto no mês, somando fixo e variável. */
export function maiorCategoria(categorias: CategoriaDoMes[]): { categoria: string; valor: number; parte: number; todas: { categoria: string; valor: number }[] } | null {
  const porNome = new Map<string, number>();
  categorias.forEach((item) => porNome.set(item.categoria, (porNome.get(item.categoria) ?? 0) + item.valor));
  const todas = [...porNome.entries()].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
  const total = todas.reduce((soma, item) => soma + item.valor, 0);
  if (!todas.length || total <= 0) return null;
  return { ...todas[0], parte: todas[0].valor / total, todas };
}

/** Variação em fração (0,05 = +5%); null quando não há base para comparar. */
export function variacao(atual: number, base: number): number | null {
  if (!base) return null;
  return (atual - base) / Math.abs(base);
}

export function porcentagem(fracao: number, casas = 0): string {
  return `${fracao >= 0 ? "+" : "−"}${Math.abs(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;
}

interface MesValores {
  mes: number;
  ano: number;
  variavel: number;
  futuro: boolean;
}

/** Média dos gastos variáveis nos 12 meses antes do mês escolhido (meses sem dado ainda contam como zero). */
export function mediaVariavelAnterior(meses: MesValores[], mes: number, ano: number): number | null {
  const indice = (m: MesValores) => m.ano * 12 + m.mes;
  const alvo = ano * 12 + mes;
  const anteriores = meses.filter((m) => !m.futuro && indice(m) < alvo && indice(m) >= alvo - 12);
  if (anteriores.length === 0) return null;
  return anteriores.reduce((soma, m) => soma + m.variavel, 0) / anteriores.length;
}
