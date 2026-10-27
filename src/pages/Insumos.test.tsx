import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const recarregarEstoque = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useInsumos", () => ({
  useInsumos: () => ({
    produtos: [],
    total: 0,
    loading: false,
    error: null,
    insumosAbaixoMinimo: 2,
    criar: vi.fn(),
    atualizar: vi.fn(),
    deletar: vi.fn(),
    registrarMovimentacao: vi.fn(),
    recarregar: recarregarEstoque,
  }),
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: vi.fn().mockResolvedValue(true) }),
}));
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/pages/insumos/OrcamentosInsumosTab", () => ({
  OrcamentosInsumosTab: ({ onEstoqueAlterado }: { onEstoqueAlterado?: () => void }) => (
    <div data-testid="aba-orcamentos">
      Lista de orçamentos
      <button onClick={onEstoqueAlterado}>aprovar-oi</button>
    </div>
  ),
}));

import Insumos from "@/pages/Insumos";

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

describe("Insumos: abas Estoque e Orçamentos", () => {
  it("abre no estoque, com o botão de novo insumo e o alerta de mínimo", () => {
    render(<Insumos />);
    expect(screen.getByRole("tab", { name: "Estoque" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /novo insumo\/peça/i })).toBeInTheDocument();
    expect(screen.getByText(/2 abaixo do mínimo/)).toBeInTheDocument();
    expect(screen.queryByTestId("aba-orcamentos")).toBeNull();
  });

  it("a aba Orçamentos troca o conteúdo e esconde as ações do estoque", async () => {
    const usuario = userEvent.setup();
    render(<Insumos />);
    await usuario.click(screen.getByRole("tab", { name: "Orçamentos" }));
    expect(screen.getByTestId("aba-orcamentos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /novo insumo\/peça/i })).toBeNull();
    expect(screen.queryByPlaceholderText(/buscar por nome, código/i)).toBeNull();

    await usuario.click(screen.getByRole("tab", { name: "Estoque" }));
    expect(screen.queryByTestId("aba-orcamentos")).toBeNull();
    expect(screen.getByPlaceholderText(/buscar por nome, código/i)).toBeInTheDocument();
  });

  it("recarrega o estoque quando um orçamento é aprovado ou cancelado", async () => {
    const usuario = userEvent.setup();
    recarregarEstoque.mockClear();
    render(<Insumos />);
    await usuario.click(screen.getByRole("tab", { name: "Orçamentos" }));
    await usuario.click(screen.getByText("aprovar-oi"));
    expect(recarregarEstoque).toHaveBeenCalledTimes(1);
  });
});
