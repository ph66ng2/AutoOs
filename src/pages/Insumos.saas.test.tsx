import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/runtime-mode", () => ({ IS_SAAS_BUILD: true }));
vi.mock("@/hooks/useInsumos", () => ({
  useInsumos: () => ({
    produtos: [],
    total: 0,
    loading: false,
    error: null,
    insumosAbaixoMinimo: 0,
    criar: vi.fn(),
    atualizar: vi.fn(),
    deletar: vi.fn(),
    registrarMovimentacao: vi.fn(),
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
  OrcamentosInsumosTab: () => <div data-testid="aba-orcamentos">Lista de orçamentos</div>,
}));

import Insumos from "@/pages/Insumos";

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

describe("Insumos no build SaaS", () => {
  it("esconde a aba Orçamentos ainda não portada", () => {
    render(<Insumos />);
    expect(screen.queryByRole("tab", { name: "Orçamentos" })).toBeNull();
    expect(screen.queryByTestId("aba-orcamentos")).toBeNull();
    expect(screen.getByRole("button", { name: /novo insumo\/peça/i })).toBeInTheDocument();
  });
});
