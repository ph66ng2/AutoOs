import { formaPagamentoRotulo } from "@/lib/orcamento-insumos";
import { parseTimestampPostgres } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/utils";
import type { Equipamento, OrcamentoInsumos } from "@/types";

/**
 * O que o cliente pode vir buscar no Balcão: um equipamento pronto ou uma venda de
 * insumos aprovada (decisão 23 do redesign). A etiqueta diz qual é; o resto do fluxo é igual.
 */
export type ItemRetirada =
  | { tipo: "EQUIPAMENTO"; chave: string; equipamento: Equipamento }
  | { tipo: "INSUMOS"; chave: string; venda: OrcamentoInsumos };

export function itemDeEquipamento(equipamento: Equipamento): ItemRetirada {
  return { tipo: "EQUIPAMENTO", chave: `eq-${equipamento.id}`, equipamento };
}

export function itemDeVenda(venda: OrcamentoInsumos): ItemRetirada {
  return { tipo: "INSUMOS", chave: `oi-${venda.id}`, venda };
}

/** Só equipamento Pronto e venda Aprovada podem ser entregues. */
export function podeEntregar(item: ItemRetirada): boolean {
  return item.tipo === "EQUIPAMENTO" ? item.equipamento.status === "PRONTO" : item.venda.status === "APROVADO";
}

export function clienteDoItem(item: ItemRetirada): string {
  return (item.tipo === "EQUIPAMENTO" ? item.equipamento.cliente_nome : item.venda.cliente_nome) || "Cliente não informado";
}

/** Segunda linha: "Datamax E-4205A · E4205-5521" ou "OI-32 · 1 item · ribbon". */
export function descricaoDoItem(item: ItemRetirada): string {
  if (item.tipo === "EQUIPAMENTO") {
    const eq = item.equipamento;
    return [`${eq.marca} ${eq.modelo}`.trim(), eq.serial_number].filter(Boolean).join(" · ");
  }
  const venda = item.venda;
  const itens = `${venda.total_itens} ${venda.total_itens === 1 ? "item" : "itens"}`;
  return [venda.numero_exibicao, itens, venda.categorias_itens].filter(Boolean).join(" · ");
}

/**
 * Terceira linha: valor e forma de pagamento. O app não sabe se foi pago, então não
 * diz "pago" nem "a receber". A forma de pagamento só existe na venda de insumos;
 * no equipamento aparece só o valor.
 */
export function valorDoItem(item: ItemRetirada): string {
  if (item.tipo === "EQUIPAMENTO") {
    const valor = item.equipamento.valor_final ?? item.equipamento.valor_orcamento;
    return valor != null ? formatCurrency(valor) : "";
  }
  const { valor_total, forma_pagamento_codigo } = item.venda;
  return forma_pagamento_codigo ? `${formatCurrency(valor_total)} · ${formaPagamentoRotulo(forma_pagamento_codigo)}` : formatCurrency(valor_total);
}

function instante(item: ItemRetirada): number {
  const texto = item.tipo === "EQUIPAMENTO"
    ? item.equipamento.atualizado_em || item.equipamento.data_entrada
    : item.venda.decidido_em || item.venda.atualizado_em;
  if (!texto) return 0;
  const data = parseTimestampPostgres(texto).getTime();
  return Number.isNaN(data) ? 0 : data;
}

/** Junta as duas filas, do que ficou pronto por último para o mais antigo. */
export function juntarFilaRetirada(equipamentos: Equipamento[], vendas: OrcamentoInsumos[]): ItemRetirada[] {
  return [...equipamentos.map(itemDeEquipamento), ...vendas.map(itemDeVenda)].sort((a, b) => instante(b) - instante(a));
}
