import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PortalAlertasBotao } from "@/components/PortalAlertas";
import type { AlertaPortal } from "@/types";

const mocks = vi.hoisted(() => ({
  contar: vi.fn(),
  listar: vi.fn(),
  marcar: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    contarAlertasPortalNaoLidos: mocks.contar,
    listarAlertasPortal: mocks.listar,
    marcarAlertasPortalLidos: mocks.marcar,
  },
}));

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

function renderBotao() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<PortalAlertasBotao collapsed={false} />} />
        <Route path="/equipamentos" element={<Destino />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PortalAlertas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contar.mockResolvedValue(1);
    mocks.listar.mockResolvedValue([alerta]);
    mocks.marcar.mockResolvedValue(1);
  });

  it("mostra o contador de não lidos e o histórico persistente", async () => {
    renderBotao();
    expect(await screen.findByRole("button", { name: "Alertas do portal: 1 não lido(s)" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Alertas do portal/ }));
    expect(await screen.findByText(alerta.titulo)).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenCalledWith(true, 100);

    mocks.listar.mockResolvedValue([{ ...alerta, lidoEm: "2026-10-15T15:05:00Z", lidoPor: "Recepção" }]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Histórico" }));
    fireEvent.click(screen.getByRole("tab", { name: "Histórico" }));
    expect(await screen.findByText(/Lido por Recepção/)).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenLastCalledWith(false, 200);
  });

  it("abrir o atendimento marca como lido e navega até o equipamento", async () => {
    renderBotao();
    fireEvent.click(await screen.findByRole("button", { name: /Alertas do portal/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Abrir atendimento" }));
    await waitFor(() => expect(mocks.marcar).toHaveBeenCalledWith(3));
    expect(await screen.findByText("Equipamentos 28")).toBeInTheDocument();
  });

  it("sem sessão ou sem migration, o botão fica sem contador", async () => {
    mocks.contar.mockRejectedValue("Acesso sensível bloqueado");
    renderBotao();
    await waitFor(() => expect(mocks.contar).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Alertas do portal" })).toBeInTheDocument();
  });
});
