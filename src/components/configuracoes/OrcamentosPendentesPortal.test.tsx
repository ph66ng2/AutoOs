import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrcamentosPendentesPortal } from "@/components/configuracoes/OrcamentosPendentesPortal";

const mocks = vi.hoisted(() => ({ publicarTodos: vi.fn(), ensure: vi.fn(), pendentes: [] as unknown[] }));
vi.mock("@/hooks/useOrcamentosPendentesPortal", () => ({
  useOrcamentosPendentesPortal: () => ({ pendentes: mocks.pendentes, loading: false, error: null, publicarTodos: mocks.publicarTodos, recarregar: vi.fn() }),
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensure }) }));

const pendentes = [
  { equipamento_id: 1, descricao: "HP LaserJet - série A1", prazo_aprovacao: "2026-11-10" },
  { equipamento_id: 2, descricao: "Epson L3150 - série B2", prazo_aprovacao: "2026-10-01" },
];

describe("OrcamentosPendentesPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pendentes = [];
    mocks.ensure.mockResolvedValue(true);
  });

  it("não mostra o botão quando não há orçamentos pendentes", () => {
    const { container } = render(<OrcamentosPendentesPortal />);
    expect(screen.queryByRole("button", { name: /Enviar orçamentos pendentes ao portal/ })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra o rótulo com a quantidade de pendentes", () => {
    mocks.pendentes = pendentes;
    render(<OrcamentosPendentesPortal />);
    expect(screen.getByRole("button", { name: "Enviar orçamentos pendentes ao portal (2)" })).toBeInTheDocument();
  });

  it("não publica sem PIN", async () => {
    mocks.pendentes = pendentes;
    mocks.ensure.mockResolvedValue(false);
    render(<OrcamentosPendentesPortal />);
    fireEvent.click(screen.getByRole("button", { name: /Enviar orçamentos pendentes ao portal/ }));
    await waitFor(() => expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({
      anyPermission: ["MANAGE_STATUS_LINKS", "PREPARE_QUOTES"],
    })));
    expect(mocks.publicarTodos).not.toHaveBeenCalled();
  });

  it("mostra no resumo a falha por prazo vencido", async () => {
    mocks.pendentes = pendentes;
    mocks.publicarTodos.mockResolvedValue({
      publicados: [1],
      falhas: [{
        equipamento_id: 2,
        descricao: "Epson L3150 - série B2",
        motivo: "O prazo de aprovação do orçamento já terminou. Atualize o prazo antes de enviar.",
      }],
    });
    render(<OrcamentosPendentesPortal />);
    fireEvent.click(screen.getByRole("button", { name: /Enviar orçamentos pendentes ao portal/ }));

    const resumo = await screen.findByRole("status");
    expect(resumo).toHaveTextContent("1 orçamento(s) enviados ao portal.");
    expect(resumo).toHaveTextContent("Não enviados:");
    expect(resumo).toHaveTextContent(
      "Epson L3150 - série B2 — O prazo de aprovação do orçamento já terminou. Atualize o prazo antes de enviar.",
    );
  });
});
