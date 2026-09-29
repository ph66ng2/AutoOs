import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PecasDoServico } from "@/components/equipamentos/PecasDoServico";

const mocks = vi.hoisted(() => ({ carregarProdutos: vi.fn() }));

vi.mock("@/lib/data/servicos-repository", () => ({ carregarProdutosParaPecas: mocks.carregarProdutos }));

const product = {
  id: "33333333-3333-4333-8333-333333333333",
  empresa_id: "11111111-1111-4111-8111-111111111111",
  nome: "Cabeça térmica",
  quantidade_estoque: 4,
  preco_venda: 85.5,
  ativo: true,
};

describe("PecasDoServico", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.carregarProdutos.mockResolvedValue([product]);
  });

  it("adiciona produto do estoque com quantidade inicial, preço e saldo", async () => {
    const onChange = vi.fn();
    render(<PecasDoServico pecas={[]} onChange={onChange} />);

    await waitFor(() => expect(screen.getByRole("option", { name: /Cabeça térmica/ })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("combobox", { name: "Adicionar peça" }), { target: { value: product.id } });

    expect(onChange).toHaveBeenCalledWith([{
      produto_id: product.id,
      nome: product.nome,
      quantidade: 1,
      valor_unitario: product.preco_venda,
    }]);
    expect(screen.getByRole("option", { name: /Cabeça térmica.*saldo 4/ })).toBeInTheDocument();
  });
});
