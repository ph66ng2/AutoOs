import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortalFuncionamentoCard } from "@/components/configuracoes/PortalFuncionamentoCard";

const mocks = vi.hoisted(() => ({ obter: vi.fn(), definir: vi.fn(), ensure: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { obterEstadoPortal: mocks.obter, definirEstadoPortal: mocks.definir } }));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensure }) }));
vi.mock("@/components/configuracoes/OrcamentosPendentesPortal", () => ({ OrcamentosPendentesPortal: () => null }));

describe("PortalFuncionamentoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(true);
    mocks.obter.mockResolvedValue({ portalAtivo: true, respostasAtivas: false, respostasAtrasadas: 0 });
  });

  it("liga as respostas pelo portal pedindo PIN com a permissão financeira", async () => {
    mocks.definir.mockResolvedValue({ portalAtivo: true, respostasAtivas: true, respostasAtrasadas: 0 });
    render(<PortalFuncionamentoCard />);
    const respostas = await screen.findByRole("switch", { name: "Clientes podem responder orçamentos" });
    expect(respostas).toHaveAttribute("aria-checked", "false");
    fireEvent.click(respostas);
    await waitFor(() => expect(mocks.definir).toHaveBeenCalledWith(true, true));
    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));
    expect(await screen.findByRole("switch", { name: "Clientes podem responder orçamentos" })).toHaveAttribute("aria-checked", "true");
  });

  it("sem PIN não muda nada", async () => {
    mocks.ensure.mockResolvedValue(false);
    render(<PortalFuncionamentoCard />);
    fireEvent.click(await screen.findByRole("switch", { name: "Portal ligado" }));
    await waitFor(() => expect(mocks.ensure).toHaveBeenCalled());
    expect(mocks.definir).not.toHaveBeenCalled();
  });

  it("avisa quando respostas vencidas não estão sendo aplicadas", async () => {
    mocks.obter.mockResolvedValue({ portalAtivo: true, respostasAtivas: true, respostasAtrasadas: 2 });
    render(<PortalFuncionamentoCard />);
    expect(await screen.findByText(/2 resposta\(s\) passaram do prazo/)).toBeInTheDocument();
  });
});
