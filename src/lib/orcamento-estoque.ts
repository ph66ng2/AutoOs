import { db } from "@/lib/db";
import type { PecaNecessaria, PecaVinculada, Produto, ServicoNecessario } from "@/types";

export function orcamentoJaAprovado(status: string): boolean {
  return ["APROVADO", "EM_MANUTENCAO", "AGUARDANDO_PECA", "PRONTO", "ENTREGUE"].includes(status);
}

export async function carregarProdutosOrcamento(): Promise<Produto[]> {
  const produtos: Produto[] = [];
  for (let pagina = 0; ; pagina++) {
    const lote = await db.listarProdutos(undefined, undefined, false, pagina);
    produtos.push(...lote);
    if (lote.length < 50) return produtos;
  }
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
