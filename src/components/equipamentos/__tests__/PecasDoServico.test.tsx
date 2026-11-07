import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PecaVinculada } from "@/types";
import { PecasDoServico } from "@/components/equipamentos/PecasDoServico";

const mocks = vi.hoisted(() => ({ carregarProdutos: vi.fn(), listarProdutos: vi.fn() }));

vi.mock("@/lib/data/servicos-repository", () => ({ carregarProdutosParaPecas: mocks.carregarProdutos }));
vi.mock("@/lib/db", () => ({ db: { listarProdutos: mocks.listarProdutos } }));

const produto = (id: number, nome: string, categoria: string, quantidade_estoque = 5, preco_venda = 10) =>
  ({ id, empresa_id: 1, nome, categoria, quantidade_estoque, preco_venda, ativo: true });

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

  it("mostra sem preço quando a peça do desktop não tem valor de venda", async () => {
    mocks.listarProdutos.mockResolvedValue([produto(1, "Cabeçote térmico", "PEÇA", 5, 0)]);
    render(<PecasDoServico pecas={[]} onChange={vi.fn()} saasMode={false} />);
    expect(await screen.findByRole("option", { name: /sem preço/ })).toBeInTheDocument();
  });

  it("no desktop oferece só a categoria Peça e mantém legível, com saldo, peça antiga de outra categoria", async () => {
    mocks.listarProdutos.mockResolvedValue([
      produto(1, "Cabeçote térmico", "PEÇA"),
      produto(2, "Etiqueta 100x50", "ETIQUETA"),
    ]);
    const antiga: PecaVinculada<number>[] = [{ produto_id: 2, nome: "Etiqueta 100x50", quantidade: 8, valor_unitario: 3 }];
    render(<PecasDoServico pecas={antiga} onChange={vi.fn()} saasMode={false} />);
    expect(screen.getByText("Etiqueta 100x50")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantidade de Etiqueta 100x50")).toHaveValue(8);
    expect(await screen.findByText(/Saldo 5 · falta peça/)).toBeInTheDocument();
    const select = screen.getByLabelText("Adicionar peça");
    expect(within(select).queryByRole("option", { name: /Etiqueta/ })).not.toBeInTheDocument();
  });
  it("informa o pai quando o preço da peça tem texto inválido e volta a válido ao corrigir/desmontar", async () => {
    const onValidity = vi.fn();
    const pecas = [{ produto_id: product.id, nome: product.nome, quantidade: 1, valor_unitario: 10 }] as PecaVinculada<string>[];
    const { unmount } = render(<PecasDoServico pecas={pecas} onChange={vi.fn()} onValidityChange={onValidity} />);
    await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(true));

    const campo = screen.getByLabelText(`Valor de ${product.nome}`);
    fireEvent.change(campo, { target: { value: "abc" } });
    fireEvent.blur(campo);
    await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(false));

    unmount();
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });
});
