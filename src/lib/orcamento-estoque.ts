import { db } from "@/lib/db";
import type { PecaNecessaria, PecaVinculada, Produto, ServicoNecessario } from "@/types";

export function orcamentoJaAprovado(status: string): boolean {
  return ["APROVADO", "EM_MANUTENCAO", "AGUARDANDO_PECA", "PRONTO", "ENTREGUE"].includes(status);
}

export function orcamentoEmElaboracao(status: string): boolean {
  return ["RECEBIDO", "EM_VERIFICACAO", "VERIFICADO", "AGUARDANDO_APROVACAO"].includes(status);
}

/**
 * Espelha `status_change_allows_quote_preparation` (equipamentos.rs): a transição que "Elaborar e enviar
 * orçamentos" cobre sozinha. Qualquer outra mudança sensível continua exigindo a permissão financeira.
 */
export function transicaoElaboraOrcamento(
  statusAtual: string,
  novoStatus: string,
  correcao: boolean,
  valorFinal?: number | null,
): boolean {
  return !correcao
    && !valorFinal
    && novoStatus === "AGUARDANDO_APROVACAO"
    && (statusAtual === "VERIFICADO" || statusAtual === "AGUARDANDO_APROVACAO");
}

/** Categoria do estoque (Insumos) oferecida em "Peças vinculadas". */
export const CATEGORIA_PECAS_ORCAMENTO = "PEÇA";

export function produtosSelecionaveisComoPeca(produtos: Produto[]): Produto[] {
  return produtos.filter((produto) => produto.categoria === CATEGORIA_PECAS_ORCAMENTO);
}

export async function carregarProdutosOrcamento(): Promise<Produto[]> {
  const produtos: Produto[] = [];
  for (let pagina = 0; ; pagina++) {
    const lote = await db.listarProdutos(undefined, undefined, false, pagina);
    produtos.push(...lote);
    if (lote.length < 50) return produtos;
  }
}

/** Não há flag de garantia no banco: item com valor 0,00 é a convenção da verificação. */
export const MENSAGEM_TOTAL_ZERO_SEM_GARANTIA =
  "Total R$ 0,00 só segue sem aprovação quando todos os itens são de garantia. Com item cobrado ou sem itens, informe um valor maior que zero.";
export const MENSAGEM_AGUARDANDO_TOTAL_ZERO =
  "Orçamento aguardando aprovação não pode ficar com R$ 0,00.";
export const MENSAGEM_ZERAR_APROVADO_PAGO =
  "Não é possível zerar um orçamento já aprovado e pago.";

export function osSomenteGarantia(
  servicos: Array<{
    valor?: number;
    pecas?: Array<{ valor_unitario?: number; valorTotal?: number }>;
  }>,
): boolean {
  if (servicos.length === 0) return false;
  return servicos.every((servico) => {
    if ((Number(servico.valor) || 0) > 0) return false;
    return (servico.pecas ?? []).every((peca) => {
      return !((Number(peca.valor_unitario) || 0) > 0) && !((Number(peca.valorTotal) || 0) > 0);
    });
  });
}

export function pecasParaOrcamento(servicos: ServicoNecessario[]): PecaNecessaria[] {
  return servicos.flatMap((servico) => (servico.pecas ?? []).map((peca) => ({
    id: `${servico.id}:${peca.produto_id}`,
    nome: peca.nome,
    quantidade: peca.quantidade,
    valorUnitario: peca.valor_unitario,
    valorTotal: peca.quantidade * peca.valor_unitario,
  })));
}

export function normalizarServicosOrcamento(servicos: ServicoNecessario[]): ServicoNecessario[] {
  return servicos.map((servico, indice) => ({ ...servico, id: servico.id || `legacy:${indice}` }));
}

/** O que está na tela difere do orçamento salvo (serviços, peças vinculadas ou valor)? */
export function orcamentoMudou(
  salvo: { servicos_necessarios?: string | null; custo_total?: number | null },
  servicos: ServicoNecessario[],
  total: number,
): boolean {
  if (Math.abs((salvo.custo_total ?? 0) - total) > 0.001) return true;
  let anteriores: ServicoNecessario[] = [];
  try {
    anteriores = JSON.parse(salvo.servicos_necessarios || "[]") as ServicoNecessario[];
  } catch {
    return true;
  }
  return JSON.stringify(normalizarServicosOrcamento(anteriores)) !== JSON.stringify(servicos);
}

export function validarPecas(pecas: PecaVinculada[]): boolean {
  return pecas.every((peca) => Number.isInteger(peca.produto_id) && peca.produto_id > 0
    && Number.isInteger(peca.quantidade) && peca.quantidade > 0
    && Number.isFinite(peca.valor_unitario) && peca.valor_unitario >= 0);
}

export function resumirPecas(servicos: ServicoNecessario[]): Array<{ produto_id: number; nome: string; quantidade: number }> {
  const resumo = new Map<number, { produto_id: number; nome: string; quantidade: number }>();
  for (const servico of servicos) for (const peca of servico.pecas ?? []) {
    const anterior = resumo.get(peca.produto_id);
    resumo.set(peca.produto_id, { produto_id: peca.produto_id, nome: peca.nome,
      quantidade: (anterior?.quantidade ?? 0) + peca.quantidade });
  }
  return [...resumo.values()];
}
