import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { EVENTO_ALERTAS_PORTAL, PortalAlertasSino, visualDoAlerta } from "@/components/PortalAlertas";
import { __resetErrosRegistrados } from "@/lib/error-log";
import { notificarErro } from "@/hooks/useNotification";
import type { AlertaPortal } from "@/types";

const mocks = vi.hoisted(() => ({
  contar: vi.fn(),
  listar: vi.fn(),
  marcar: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() }),
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
    __resetErrosRegistrados();
    mocks.contar.mockResolvedValue(1);
    mocks.listar.mockResolvedValue([alerta]);
    mocks.marcar.mockResolvedValue(1);
  });
  afterEach(() => vi.useRealTimers());

  it("mostra o contador e abre o painel com não lidos e histórico", async () => {
    renderSino();
    const sino = await screen.findByRole("button", { name: "Notificações: 1 não lida(s)" });
    fireEvent.click(sino);
    expect(await screen.findByText(alerta.titulo)).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenLastCalledWith(true, 100);

    mocks.listar.mockResolvedValue([{ ...alerta, lidoEm: "2026-10-15T15:05:00Z", lidoPor: "Recepção" }]);
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    expect(await screen.findByText(/Lido por Recepção/)).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenLastCalledWith(false, 200);
  });

  it("na primeira consulta não dispara toast (só o contador)", async () => {
    renderSino();
    await screen.findByRole("button", { name: /1 não lida/ });
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("alerta que chega depois vira toast no mesmo padrão dos avisos do app", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSino();
    await screen.findByRole("button", { name: /1 não lida/ });
    const falha: AlertaPortal = { ...alerta, id: 4, tipo: "EFETIVACAO_FALHOU", titulo: "Resposta do cliente NÃO efetivada" };
    mocks.contar.mockResolvedValue(2);
    mocks.listar.mockResolvedValue([falha, alerta]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(
      "Resposta do cliente NÃO efetivada",
      expect.objectContaining({ duration: Infinity, action: expect.objectContaining({ label: "Ver" }) }),
    ));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /2 não lida/ })).toBeInTheDocument();
    // Abrir o painel recolhe os avisos do portal, que já estão listados nele.
    fireEvent.click(screen.getByRole("button", { name: /2 não lida/ }));
    await waitFor(() => expect(mocks.toast.dismiss).toHaveBeenCalledWith("portal-alerta-4"));
  });

  it("abrir o atendimento marca como lido, fecha o painel e navega", async () => {
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Abrir atendimento" }));
    await waitFor(() => expect(mocks.marcar).toHaveBeenCalledWith(3));
    expect(await screen.findByText("Equipamentos 28")).toBeInTheDocument();
  });

  it("Esc fecha o painel", async () => {
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações/ }));
    expect(await screen.findByRole("dialog", { name: "Notificações" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sem sessão ou sem migration, o sino fica sem contador", async () => {
    mocks.contar.mockRejectedValue("Acesso sensível bloqueado");
    renderSino();
    await waitFor(() => expect(mocks.contar).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "Notificações" })).toBeInTheDocument();
  });

  it("aprovação efetivada chega em verde, sem cara de erro, e falha usa o aviso de erro do app", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSino();
    await screen.findByRole("button", { name: /1 não lida/ });
    const aprovado: AlertaPortal = { ...alerta, id: 9, tipo: "DECISAO_EFETIVADA", decisao: "APROVAR", titulo: "Orçamento aprovado pelo cliente",
      detalhe: "Zebra ZT230 · série SER-123 · R$ 350,00 · Ana Souza" };
    mocks.contar.mockResolvedValue(2);
    mocks.listar.mockResolvedValue([aprovado, alerta]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Orçamento aprovado pelo cliente", expect.objectContaining({
      duration: 10_000,
      classNames: expect.objectContaining({ toast: expect.stringContaining("emerald") }),
    })));
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("cada tipo tem cor própria; recusa efetivada não fica verde", () => {
    expect(visualDoAlerta({ tipo: "DECISAO_EFETIVADA", decisao: "APROVAR" }).chip).toContain("emerald");
    expect(visualDoAlerta({ tipo: "DECISAO_EFETIVADA", decisao: "RECUSAR" }).chip).toContain("slate");
    expect(visualDoAlerta({ tipo: "RESPOSTA_RECEBIDA", decisao: "APROVAR" }).chip).toContain("sky");
    expect(visualDoAlerta({ tipo: "EFETIVACAO_FALHOU", decisao: "APROVAR" }).erro).toBe(true);
    expect(visualDoAlerta({ tipo: "NEGOCIACAO_SOLICITADA" }).chip).toContain("violet");
  });

  it("'Ver' no aviso marca o alerta como lido, abre o atendimento e avisa a lista de equipamentos", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const eventos: number[][] = [];
    const ouvir = (event: Event) => eventos.push((event as CustomEvent<{ equipamentoIds: number[] }>).detail.equipamentoIds);
    window.addEventListener(EVENTO_ALERTAS_PORTAL, ouvir);
    renderSino();
    await screen.findByRole("button", { name: /1 não lida/ });
    const novo: AlertaPortal = { ...alerta, id: 7, equipamentoId: 41 };
    mocks.contar.mockResolvedValue(2);
    mocks.listar.mockResolvedValue([novo, alerta]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(eventos).toEqual([[41]]);
    const opcoes = mocks.toast.mock.calls[0][1] as { action: { onClick: () => void } };
    act(() => opcoes.action.onClick());
    await waitFor(() => expect(mocks.marcar).toHaveBeenCalledWith(7));
    expect(await screen.findByText("Equipamentos 41")).toBeInTheDocument();
    window.removeEventListener(EVENTO_ALERTAS_PORTAL, ouvir);
  });

  it("abas Todos / Erros / Portal do Cliente separam erros do app e alertas do portal", async () => {
    notificarErro("Equipamentos", "Salvar equipamento", new Error("AUTOOS:DB:42P01#ABCD2345\nNão foi possível concluir esta ação."));
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: "Notificações: 2 não lida(s)" }));
    expect(await screen.findByText(alerta.titulo)).toBeInTheDocument();
    expect(screen.getByText("Equipamentos — Salvar equipamento")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Erros/ }));
    expect(screen.queryByText(alerta.titulo)).not.toBeInTheDocument();
    expect(screen.getByText("Equipamentos — Salvar equipamento")).toBeInTheDocument();
    expect(screen.getByText(/AUTOOS:DB:42P01/)).toBeInTheDocument();
    expect(screen.getByText(/ref ABCD2345/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Portal do Cliente/ }));
    expect(screen.getByText(alerta.titulo)).toBeInTheDocument();
    expect(screen.queryByText("Equipamentos — Salvar equipamento")).not.toBeInTheDocument();
  });

  it("copiar no painel de erros leva código, descrição técnica e referência do log", async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escrever }, configurable: true });
    notificarErro("Clientes", "Salvar cliente", new Error("AUTOOS:DB:23503#QWER2345\nNão foi possível concluir esta ação."));
    mocks.contar.mockResolvedValue(0);
    mocks.listar.mockResolvedValue([]);
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações/ }));
    fireEvent.click(await screen.findByRole("tab", { name: /Erros/ }));
    fireEvent.click(screen.getByRole("button", { name: /Copiar relatório/ }));
    await waitFor(() => expect(escrever).toHaveBeenCalled());
    const texto = escrever.mock.calls[0][0] as string;
    expect(texto).toContain("Código: AUTOOS:DB:23503");
    expect(texto).toContain("Descrição técnica: SQLSTATE 23503 · referência a registro inexistente (chave estrangeira)");
    expect(texto).toContain("Referência no log: QWER2345");
    expect(texto).toContain("Contexto: Clientes");
    expect(texto).toContain("Mensagem: Não foi possível concluir esta ação.");
    expect(await screen.findByText("Copiado")).toBeInTheDocument();
  });
});
