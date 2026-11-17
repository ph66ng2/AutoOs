import type { Produto } from "@/types";

const ORIGENS: Record<string, string> = {
  MANUTENCAO: "OS",
  VENDA_INSUMOS: "venda",
  CORRECAO_ORCAMENTO: "correção de orçamento",
};

function diaMes(data: string): string {
  const partes = data.match(/^\d{4}-(\d{2})-(\d{2})/);
  return partes ? `${partes[2]}/${partes[1]}` : "";
}

/** "Saída · OS · PC42-0931 · 07/11" a partir da última movimentação do item; null se não houver. */
export function textoUltimaMovimentacao(produto: Pick<Produto, "ultima_mov_tipo" | "ultima_mov_origem" | "ultima_mov_referencia" | "ultima_mov_data">): string | null {
  if (!produto.ultima_mov_tipo) return null;
  const tipo = produto.ultima_mov_tipo === "SAIDA" ? "Saída" : produto.ultima_mov_tipo === "ENTRADA" ? "Entrada" : produto.ultima_mov_tipo;
  const origemBruta = produto.ultima_mov_origem?.trim();
  const referencia = produto.ultima_mov_referencia?.trim();
  const rotuloOrigem = origemBruta ? (ORIGENS[origemBruta] ?? origemBruta.toLowerCase()) : "";
  // "OS · OS #931" repetiria a palavra: a referência já diz que é uma OS.
  const origem = rotuloOrigem === "OS" && referencia?.startsWith("OS") ? "" : rotuloOrigem;
  const data = produto.ultima_mov_data ? diaMes(produto.ultima_mov_data) : "";
  return [tipo, origem, referencia, data].filter(Boolean).join(" · ");
}
