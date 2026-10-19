import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PecasDoServico } from "../PecasDoServico";
import type { PecaVinculada } from "@/types";

const { listarProdutos } = vi.hoisted(() => ({ listarProdutos: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { listarProdutos } }));

const produto = (id: number, nome: string, categoria: string, quantidade_estoque = 5) =>
  ({ id, nome, categoria, quantidade_estoque, preco_venda: 10 });

beforeEach(() => {
  listarProdutos.mockReset();
  listarProdutos.mockResolvedValue([
    produto(1, "Cabeçote térmico", "PEÇA"),
    produto(2, "Etiqueta 100x50", "ETIQUETA"),
    produto(3, "Ribbon cera", "RIBBON"),
    produto(4, "Impressora ZD220", "IMPRESSORA"),
    produto(5, "Rolo de pressão", "PEÇA"),
  ]);
});

describe("PecasDoServico", () => {
  it("oferece só produtos da categoria Peça no seletor", async () => {
    render(<PecasDoServico pecas={[]} onChange={vi.fn()} />);
    const select = await screen.findByLabelText("Adicionar peça");
    await screen.findByRole("option", { name: /Cabeçote térmico/ });
    const nomes = within(select).getAllByRole("option").map((option) => option.textContent);
    expect(nomes.some((nome) => nome?.includes("Rolo de pressão"))).toBe(true);
    expect(nomes.some((nome) => nome?.includes("Etiqueta"))).toBe(false);
    expect(nomes.some((nome) => nome?.includes("Ribbon"))).toBe(false);
    expect(nomes.some((nome) => nome?.includes("Impressora"))).toBe(false);
  });

  it("adiciona a peça escolhida com o preço de venda", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PecasDoServico pecas={[]} onChange={onChange} />);
    await screen.findByRole("option", { name: /Cabeçote térmico/ });
    await user.selectOptions(screen.getByLabelText("Adicionar peça"), "1");
    expect(onChange).toHaveBeenCalledWith([{ produto_id: 1, nome: "Cabeçote térmico", quantidade: 1, valor_unitario: 10 }]);
  });

  it("mantém legível, com saldo, uma peça antiga vinculada que não é da categoria Peça", async () => {
    const antiga: PecaVinculada[] = [{ produto_id: 2, nome: "Etiqueta 100x50", quantidade: 8, valor_unitario: 3 }];
    render(<PecasDoServico pecas={antiga} onChange={vi.fn()} />);
    expect(screen.getByText("Etiqueta 100x50")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantidade de Etiqueta 100x50")).toHaveValue(8);
    expect(await screen.findByText(/Saldo 5 · falta peça/)).toBeInTheDocument();
    const select = screen.getByLabelText("Adicionar peça");
    expect(within(select).queryByRole("option", { name: /Etiqueta/ })).not.toBeInTheDocument();
  });
});
