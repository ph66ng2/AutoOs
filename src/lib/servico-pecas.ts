import type { PecaNecessaria, ServicoNecessario } from "@/types";

function subtotal(quantidade: number, valorUnitario: number): number {
  return Math.round(quantidade * valorUnitario * 100) / 100;
}

export function pecasDosServicosParaVerificacao(servicos: ServicoNecessario[]): PecaNecessaria[] {
  return servicos.flatMap((servico) => (servico.pecas ?? []).map((peca) => ({
    id: `${servico.id}:${String(peca.produto_id)}`,
    produto_id: peca.produto_id,
    servico_id: servico.id,
    nome: peca.nome,
    quantidade: peca.quantidade,
    valorUnitario: peca.valor_unitario,
    valorTotal: subtotal(peca.quantidade, peca.valor_unitario),
  })));
}

/** Keeps manually entered pieces and refreshes stock-linked pieces from services. */
export function mesclarPecasDoOrcamento(
  pecasSalvas: PecaNecessaria[],
  servicos: ServicoNecessario[],
): PecaNecessaria[] {
  const pecasManuais = pecasSalvas.filter((peca) => !peca.servico_id);
  return [...pecasManuais, ...pecasDosServicosParaVerificacao(servicos)];
}

export function somarPecas(pecas: PecaNecessaria[]): number {
  return pecas.reduce((total, peca) => total + (Number(peca.valorTotal) || 0), 0);
}
