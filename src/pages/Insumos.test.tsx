import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";


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
    consultarUsoEmOrcamentos: vi.fn().mockResolvedValue(null),
    recarregar: vi.fn(),
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

describe("Insumos: só o estoque", () => {
  it("abre no estoque, com o botão de novo item e o alerta de mínimo", () => {
    render(<Insumos />);
    expect(screen.getByRole("button", { name: /novo item/i })).toBeInTheDocument();
    expect(screen.getByText("Abaixo do mínimo").parentElement).toHaveTextContent(/Abaixo do mínimo\s*2/);
    expect(screen.getByPlaceholderText(/buscar por nome, código/i)).toBeInTheDocument();
  });

  it("os orçamentos de insumos não aparecem mais aqui (foram para Vendas de insumos)", () => {
    render(<Insumos />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByTestId("aba-orcamentos")).toBeNull();
  });
});
