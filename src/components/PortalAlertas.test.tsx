import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PortalAlertasSino } from "@/components/PortalAlertas";
import type { AlertaPortal } from "@/types";

const mocks = vi.hoisted(() => ({
  contar: vi.fn(),
  listar: vi.fn(),
  marcar: vi.fn(),
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("@/lib/db", () => ({
  db: {
    contarAlertasPortalNaoLidos: mocks.contar,
    listarAlertasPortal: mocks.listar,
    marcarAlertasPortalLidos: mocks.marcar,
  },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

const alerta: AlertaPortal = {
  id: 3,
  equipamentoId: 28,
  tipo: "RESPOSTA_RECEBIDA",
  titulo: "Cliente aceitou o orçamento — em prazo de correção",
  detalhe: "Impressora Zebra ZT230 (série SER-123). Orçamento v2, R$ 350,00.",
  criadoEm: "2026-10-15T15:00:00Z",
};

function Destino() {
  const location = useLocation();
  return <p>Equipamentos {(location.state as { equipamentoId?: number } | null)?.equipamentoId}</p>;
}

function renderSino() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<PortalAlertasSino />} />
        <Route path="/equipamentos" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PortalAlertasSino", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contar.mockResolvedValue(1);
    mocks.listar.mockResolvedValue([alerta]);
    mocks.marcar.mockResolvedValue(1);
  });
  afterEach(() => vi.useRealTimers());

  it("mostra o contador e abre o painel com não lidos e histórico", async () => {
    renderSino();
    const sino = await screen.findByRole("button", { name: "Alertas do portal: 1 não lido(s)" });
    fireEvent.click(sino);
    expect(await screen.findByText(alerta.titulo)).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenLastCalledWith(true, 100);

    mocks.listar.mockResolvedValue([{ ...alerta, lidoEm: "2026-10-15T15:05:00Z", lidoPor: "Recepção" }]);
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));
    expect(await screen.findByText(/Lido por Recepção/)).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenLastCalledWith(false, 200);
  });

  it("na primeira consulta não dispara toast (só o contador)", async () => {
    renderSino();
    await screen.findByRole("button", { name: /1 não lido/ });
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });

  it("alerta que chega depois vira toast no mesmo padrão dos avisos do app", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSino();
    await screen.findByRole("button", { name: /1 não lido/ });
    const falha: AlertaPortal = { ...alerta, id: 4, tipo: "EFETIVACAO_FALHOU", titulo: "Resposta do cliente NÃO efetivada" };
    mocks.contar.mockResolvedValue(2);
    mocks.listar.mockResolvedValue([falha, alerta]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(
      "Resposta do cliente NÃO efetivada",
      expect.objectContaining({ duration: Infinity, action: expect.objectContaining({ label: "Ver" }) }),
    ));
    expect(mocks.toast.warning).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /2 não lido/ })).toBeInTheDocument();
    // Abrir o painel recolhe os avisos do portal, que já estão listados nele.
    fireEvent.click(screen.getByRole("button", { name: /2 não lido/ }));
    await waitFor(() => expect(mocks.toast.dismiss).toHaveBeenCalledWith("portal-alerta-4"));
  });

  it("abrir o atendimento marca como lido, fecha o painel e navega", async () => {
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: /Alertas do portal/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Abrir atendimento" }));
    await waitFor(() => expect(mocks.marcar).toHaveBeenCalledWith(3));
    expect(await screen.findByText("Equipamentos 28")).toBeInTheDocument();
  });

  it("Esc fecha o painel", async () => {
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: /Alertas do portal/ }));
    expect(await screen.findByRole("dialog", { name: "Alertas do Portal do Cliente" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sem sessão ou sem migration, o sino fica sem contador", async () => {
    mocks.contar.mockRejectedValue("Acesso sensível bloqueado");
    renderSino();
    await waitFor(() => expect(mocks.contar).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Alertas do portal" })).toBeInTheDocument();
  });
});
