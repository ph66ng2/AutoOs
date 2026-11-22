import { describe, expect, it } from "vitest";
import { mesclarPecasDoOrcamento, pecasDosServicosParaVerificacao, somarPecas } from "@/lib/servico-pecas";

const services = [{
  id: "service-1",
  descricao: "Troca de cabeça",
  valor: 50,
  pecas: [{ produto_id: "product-1", nome: "Cabeça", quantidade: 2, valor_unitario: 12.5 }],
}];

describe("servico-pecas", () => {
  it("converte cada peça sugerida em item de orçamento ligado ao serviço", () => {
    expect(pecasDosServicosParaVerificacao(services)).toEqual([{
      id: "service-1:product-1",
      produto_id: "product-1",
      servico_id: "service-1",
      nome: "Cabeça",
      quantidade: 2,
      valorUnitario: 12.5,
      valorTotal: 25,
    }]);
  });

  it("mantém peças manuais, substitui sugestões antigas e calcula o total sem duplicar", () => {
    const manual = { id: "manual-1", nome: "Parafuso", quantidade: 3, valorUnitario: 1, valorTotal: 3 };
    const previousSuggestion = { ...pecasDosServicosParaVerificacao(services)[0]!, valorTotal: 99 };
    const parts = mesclarPecasDoOrcamento([manual, previousSuggestion], services);

    expect(parts).toEqual([manual, pecasDosServicosParaVerificacao(services)[0]]);
    expect(somarPecas(parts)).toBe(28);
  });
});
