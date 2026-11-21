import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { EVENTO_ALERTAS_PORTAL, PortalAlertasSino, encaixePainelNotificacoes, visualDoAlerta } from "@/components/PortalAlertas";
import { __resetErrosRegistrados } from "@/lib/error-log";
import { notificarErro } from "@/hooks/useNotification";
import type { AlertaPortal } from "@/types";

const mocks = vi.hoisted(() => ({
  contar: vi.fn(),
  listar: vi.fn(),
  marcar: vi.fn(),
  avisos: vi.fn(),
  marcarAvisos: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    contarAlertasPortalNaoLidos: mocks.contar,
    listarAlertasPortal: mocks.listar,
    marcarAlertasPortalLidos: mocks.marcar,
    listarAvisosInternos: mocks.avisos,
    marcarAvisosLidos: mocks.marcarAvisos,
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
        <Route path="/insumos" element={<p>Tela de insumos</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PortalAlertasSino", () => {
  beforeEach(() => {
    mocks.avisos.mockReset().mockResolvedValue([]);
    mocks.marcarAvisos.mockReset().mockResolvedValue(1);
    vi.clearAllMocks();
    __resetErrosRegistrados();
    localStorage.clear();
    mocks.contar.mockResolvedValue(1);
    mocks.listar.mockResolvedValue([alerta]);
    mocks.marcar.mockResolvedValue(1);
  });
  afterEach(() => vi.useRealTimers());

  it("mostra o contador e abre o painel com não lidos e histórico", async () => {
    renderSino();
    const sino = await screen.findByRole("button", { name: "Notificações: 1 nova(s)" });
    fireEvent.click(sino);
    expect(await screen.findByText(alerta.titulo)).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenLastCalledWith(true, 100);

    mocks.listar.mockResolvedValue([{ ...alerta, lidoEm: "2026-10-15T15:05:00Z", lidoPor: "Recepção" }]);
    fireEvent.click(screen.getByRole("button", { name: "Histórico" }));
    expect(await screen.findByText(/Lido por Recepção/)).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenLastCalledWith(false, 200);
  });

  it("abrir o sino zera o número (visto) sem marcar como lido; o item segue não lido no painel", async () => {
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: "Notificações: 1 nova(s)" }));
    expect(await screen.findByText(alerta.titulo)).toBeInTheDocument();
    expect(mocks.marcar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    expect(await screen.findByRole("button", { name: "Notificações (há itens não lidos)" })).toBeInTheDocument();
  });

  it("com mais de 10 alertas, o número vem da conta do banco e abrir sobe a marca d'água", async () => {
    // 15 não lidos; a janela de toasts traz só os 10 mais novos (ids 6..15).
    const janela = Array.from({ length: 10 }, (_, i) => ({ ...alerta, id: 15 - i }));
    mocks.listar.mockResolvedValue(janela);
    mocks.contar.mockImplementation(async (aposId?: number) => (aposId ? 15 - aposId : 15));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: "Notificações: 15 nova(s)" }));
    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    expect(await screen.findByRole("button", { name: "Notificações (há itens não lidos)" })).toBeInTheDocument();
    // Próxima consulta pede só o que veio depois do id 15: nada novo.
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(mocks.contar).toHaveBeenLastCalledWith(15));
    expect(screen.getByRole("button", { name: "Notificações (há itens não lidos)" })).toBeInTheDocument();
  });

  it("abrir antes de a lista chegar ainda sobe a marca até o não lido de agora", async () => {
    // A lista da consulta (10 itens) nunca chega; abrir busca o maior não lido (1 item).
    mocks.listar.mockImplementation((_apenasNaoLidos: boolean, limite: number) =>
      limite === 1 ? Promise.resolve([{ ...alerta, id: 15 }]) : new Promise(() => undefined));
    mocks.contar.mockImplementation(async (aposId?: number) => (aposId ? 15 - aposId : 15));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: "Notificações: 15 nova(s)" }));
    await waitFor(() => expect(mocks.listar).toHaveBeenCalledWith(true, 1));
    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(mocks.contar).toHaveBeenLastCalledWith(15));
    expect(screen.getByRole("button", { name: "Notificações (há itens não lidos)" })).toBeInTheDocument();
  });

  it("conta do portal que estava a caminho quando o sino abriu não devolve o número", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: "Notificações: 1 nova(s)" }));
    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    await screen.findByRole("button", { name: "Notificações (há itens não lidos)" });
    // Chega o alerta 4; a consulta começa e a conta fica no caminho enquanto o sino abre.
    let soltarConta: (n: number) => void = () => undefined;
    mocks.listar.mockResolvedValue([{ ...alerta, id: 4 }, alerta]);
    mocks.contar.mockImplementation((aposId?: number) => (aposId ? new Promise((r) => { soltarConta = r; }) : Promise.resolve(2)));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    await act(async () => { soltarConta(1); });
    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    expect(await screen.findByRole("button", { name: "Notificações (há itens não lidos)" })).toBeInTheDocument();
  });

  it("na primeira consulta não dispara toast (só o contador)", async () => {
    renderSino();
    await screen.findByRole("button", { name: /1 nova/ });
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("alerta que chega depois vira toast no mesmo padrão dos avisos do app", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderSino();
    await screen.findByRole("button", { name: /1 nova/ });
    const falha: AlertaPortal = { ...alerta, id: 4, tipo: "EFETIVACAO_FALHOU", titulo: "Resposta do cliente NÃO efetivada" };
    mocks.contar.mockResolvedValue(2);
    mocks.listar.mockResolvedValue([falha, alerta]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith(
      "Resposta do cliente NÃO efetivada",
      expect.objectContaining({ duration: Infinity, action: expect.objectContaining({ label: "Ver" }) }),
    ));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: /2 nova/ })).toBeInTheDocument();
    // Abrir o painel recolhe os avisos do portal, que já estão listados nele.
    fireEvent.click(screen.getByRole("button", { name: /2 nova/ }));
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
    await screen.findByRole("button", { name: /1 nova/ });
    const aprovado: AlertaPortal = { ...alerta, id: 9, tipo: "DECISAO_EFETIVADA", decisao: "APROVAR", titulo: "Orçamento aprovado pelo cliente",
      detalhe: "Zebra ZT230 · série SER-123 · R$ 350,00 · Ana Souza" };
    mocks.contar.mockResolvedValue(2);
    mocks.listar.mockResolvedValue([aprovado, alerta]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Orçamento aprovado pelo cliente", expect.objectContaining({
      duration: 10_000,
      classNames: expect.objectContaining({ toast: expect.stringContaining("status-ok") }),
    })));
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("cada tipo tem cor própria; recusa efetivada não fica verde", () => {
    expect(visualDoAlerta({ tipo: "DECISAO_EFETIVADA", decisao: "APROVAR" }).chip).toContain("status-ok");
    expect(visualDoAlerta({ tipo: "DECISAO_EFETIVADA", decisao: "RECUSAR" }).chip).toContain("status-neutral");
    expect(visualDoAlerta({ tipo: "RESPOSTA_RECEBIDA", decisao: "APROVAR" }).chip).toContain("status-work");
    expect(visualDoAlerta({ tipo: "EFETIVACAO_FALHOU", decisao: "APROVAR" }).erro).toBe(true);
    expect(visualDoAlerta({ tipo: "NEGOCIACAO_SOLICITADA" }).chip).toContain("acc-soft");
  });

  it("'Ver' no aviso marca o alerta como lido, abre o atendimento e avisa a lista de equipamentos", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const eventos: number[][] = [];
    const ouvir = (event: Event) => eventos.push((event as CustomEvent<{ equipamentoIds: number[] }>).detail.equipamentoIds);
    window.addEventListener(EVENTO_ALERTAS_PORTAL, ouvir);
    renderSino();
    await screen.findByRole("button", { name: /1 nova/ });
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

  it("abas Avisos / Sistema: erros do app ficam em Sistema e não contam no número do sino", async () => {
    notificarErro("Equipamentos", "Salvar equipamento", new Error("AUTOOS:DB:42P01#ABCD2345\nNão foi possível concluir esta ação."));
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: "Notificações: 1 nova(s)" }));
    expect(await screen.findByText(alerta.titulo)).toBeInTheDocument();
    expect(screen.queryByText("Equipamentos — Salvar equipamento")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Sistema/ }));
    expect(screen.queryByText(alerta.titulo)).not.toBeInTheDocument();
    expect(screen.getByText("Equipamentos — Salvar equipamento")).toBeInTheDocument();
    expect(screen.getByText(/AUTOOS:DB:42P01/)).toBeInTheDocument();
    expect(screen.getByText(/ref ABCD2345/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Avisos/ }));
    expect(screen.getByText(alerta.titulo)).toBeInTheDocument();
  });

  it("só erro do app: o sino não mostra número, só avisa que há erro em Sistema", async () => {
    notificarErro("Clientes", "Salvar cliente", new Error("falhou"));
    mocks.contar.mockResolvedValue(0);
    mocks.listar.mockResolvedValue([]);
    renderSino();
    expect(await screen.findByRole("button", { name: "Notificações: erros novos em Sistema" })).toBeInTheDocument();
  });

  it("avisos internos contam no sino, aparecem em Avisos e abrir marca como lido e leva ao destino", async () => {
    mocks.contar.mockResolvedValue(0);
    mocks.listar.mockResolvedValue([]);
    mocks.avisos.mockResolvedValue([
      { chave: "estoque-baixo:abc", tipo: "estoque-baixo", titulo: "2 itens com estoque baixo", detalhe: "Ribbon 110, Etiqueta", lido: false, quando: "2026-11-19T10:00:00Z" },
      { chave: "pronto-parado:4:2026-11-10", tipo: "pronto-parado", titulo: "Pronto há 9 dias sem retirada: Elgin L42", lido: true, quando: "2026-11-17T10:00:00Z", equipamentoId: 4 },
    ]);
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: "Notificações: 1 nova(s)" }));
    expect(await screen.findByText("2 itens com estoque baixo")).toBeInTheDocument();
    expect(screen.queryByText(/Pronto há 9 dias/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver estoque" }));
    await waitFor(() => expect(mocks.marcarAvisos).toHaveBeenCalledWith(["estoque-baixo:abc"]));
    expect(await screen.findByText("Tela de insumos")).toBeInTheDocument();
  });

  it("aviso que chega com o sino já aberto fica visto: ao fechar, o número não volta", async () => {
    mocks.contar.mockResolvedValue(1);
    let soltarAvisos: (v: unknown) => void = () => undefined;
    mocks.avisos.mockReturnValue(new Promise((resolver) => { soltarAvisos = resolver; }));
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: "Notificações: 1 nova(s)" }));
    await act(async () => {
      soltarAvisos([{ chave: "estoque-baixo:abc", tipo: "estoque-baixo", titulo: "2 itens com estoque baixo", detalhe: "Ribbon 110", lido: false, quando: "2026-11-19T10:00:00Z" }]);
    });
    expect(await screen.findByText("2 itens com estoque baixo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    expect(await screen.findByRole("button", { name: "Notificações (há itens não lidos)" })).toBeInTheDocument();
  });

  it("abrir e fechar antes de os avisos internos carregarem não apaga o visto salvo deles", async () => {
    localStorage.setItem("autoos:sino-visto:7", JSON.stringify({ chaves: ["aviso:estoque-baixo:abc"], portalAte: 0 }));
    mocks.contar.mockResolvedValue(0);
    mocks.listar.mockResolvedValue([]);
    let soltarAvisos: (v: unknown) => void = () => undefined;
    mocks.avisos.mockReturnValue(new Promise((resolver) => { soltarAvisos = resolver; }));
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes><Route path="/" element={<PortalAlertasSino perfilId={7} />} /></Routes>
      </MemoryRouter>,
    );
    const sino = await screen.findByRole("button", { name: /^Notificações/ });
    fireEvent.click(sino);
    fireEvent.click(screen.getByRole("button", { name: /^Notificações/ }));
    await act(async () => {
      soltarAvisos([{ chave: "estoque-baixo:abc", tipo: "estoque-baixo", titulo: "2 itens com estoque baixo", detalhe: "Ribbon", lido: false, quando: "2026-11-19T10:00:00Z" }]);
    });
    expect(await screen.findByRole("button", { name: "Notificações (há itens não lidos)" })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("autoos:sino-visto:7") ?? "{}").chaves).toContain("aviso:estoque-baixo:abc");
  });

  it("trocar de perfil esquece os avisos do anterior e ignora a resposta atrasada dele", async () => {
    mocks.contar.mockResolvedValue(0);
    mocks.listar.mockResolvedValue([]);
    let responderAntigo: (v: unknown) => void = () => undefined;
    mocks.avisos
      .mockReturnValueOnce(new Promise((resolver) => { responderAntigo = resolver; }))
      .mockResolvedValue([]);
    const arvore = (perfilId: number) => (
      <MemoryRouter initialEntries={["/"]}>
        <Routes><Route path="/" element={<PortalAlertasSino perfilId={perfilId} />} /></Routes>
      </MemoryRouter>
    );
    const { rerender } = render(arvore(1));
    await waitFor(() => expect(mocks.avisos).toHaveBeenCalledTimes(1));
    rerender(arvore(2));
    await waitFor(() => expect(mocks.avisos).toHaveBeenCalledTimes(2));
    // A resposta do perfil 1 chega depois da troca: não pode aparecer para o perfil 2.
    await act(async () => {
      responderAntigo([{ chave: "estoque-baixo:x", tipo: "estoque-baixo", titulo: "Aviso do perfil 1", lido: false }]);
    });
    expect(screen.getByRole("button", { name: "Notificações" })).toBeInTheDocument();
  });

  it("portal desligado no perfil: sem número e sem aviso, mas a lista de equipamentos continua sendo avisada", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const eventos: number[][] = [];
    const ouvir = (event: Event) => eventos.push((event as CustomEvent<{ equipamentoIds: number[] }>).detail.equipamentoIds);
    window.addEventListener(EVENTO_ALERTAS_PORTAL, ouvir);
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes><Route path="/" element={<PortalAlertasSino portalDesligado />} /></Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "Notificações" })).toBeInTheDocument();
    mocks.contar.mockResolvedValue(2);
    mocks.listar.mockResolvedValue([{ ...alerta, id: 9, equipamentoId: 50 }, alerta]);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await waitFor(() => expect(eventos).toEqual([[50]]));
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Notificações" })).toBeInTheDocument();
    window.removeEventListener(EVENTO_ALERTAS_PORTAL, ouvir);
  });

  it("copiar no painel de erros leva código, descrição técnica e referência do log", async () => {
    const escrever = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escrever }, configurable: true });
    notificarErro("Clientes", "Salvar cliente", new Error("AUTOOS:DB:23503#QWER2345\nNão foi possível concluir esta ação."));
    mocks.contar.mockResolvedValue(0);
    mocks.listar.mockResolvedValue([]);
    renderSino();
    fireEvent.click(await screen.findByRole("button", { name: /Notificações/ }));
    fireEvent.click(await screen.findByRole("tab", { name: /Sistema/ }));
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

describe("encaixePainelNotificacoes", () => {
  it("abre para a direita e para cima quando o sino está no pé do menu", () => {
    const estilo = encaixePainelNotificacoes(
      { top: 700, bottom: 740, left: 200, right: 240 },
      { width: 1280, height: 800 },
    );
    expect(estilo.position).toBe("fixed");
    expect(estilo.left).toBe(248);
    expect(estilo.bottom).toBe(108);
    expect(estilo.top).toBeUndefined();
  });

  it("abre para baixo alinhado à direita quando o sino está no cabeçalho", () => {
    const estilo = encaixePainelNotificacoes(
      { top: 8, bottom: 48, left: 980, right: 1020 },
      { width: 1024, height: 768 },
    );
    expect(estilo.left).toBe(584);
    expect(estilo.top).toBe(56);
    expect(estilo.bottom).toBeUndefined();
  });
});
