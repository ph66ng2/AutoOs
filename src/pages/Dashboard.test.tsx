import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  db: {
    listarEquipamentos: vi.fn(),
    listarProdutos: vi.fn(),
    contarEquipamentosPorStatus: vi.fn(),
    listarMovimentoBancada: vi.fn(),
  },
  navigate: vi.fn(),
  aoVivo: null as null | (() => void),
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ status: { active_profile_name: "Ana" } }) }));
vi.mock("@/hooks/useAtualizacaoAoVivo", () => ({ useAtualizacaoAoVivo: (_tabelas: string[], recarregar: () => void) => { mocks.aoVivo = recarregar; } }));
vi.mock("react-router-dom", async (original) => ({ ...(await original<typeof import("react-router-dom")>()), useNavigate: () => mocks.navigate }));
vi.mock("recharts", async (original) => {
  const real = await original<typeof import("recharts")>();
  return { ...real, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 800, height: 300 }}>{children}</div> };
});

import Dashboard from "./Dashboard";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-22T12:00:00"));
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  vi.clearAllMocks();
  // A lista simples só traz as 50 mais novas: aqui, uma OS só. Os números não podem vir dela.
  mocks.db.listarEquipamentos.mockResolvedValue([
    { id: 55, serial_number: "QA", marca: "Zebra", modelo: "ZD", tipo: "Impressora", status: "AGUARDANDO_APROVACAO", data_entrada: "2026-11-20" },
  ]);
  mocks.db.listarProdutos.mockResolvedValue([]);
  mocks.db.contarEquipamentosPorStatus.mockResolvedValue({
    RECEBIDO: 3, VERIFICADO: 1, AGUARDANDO_APROVACAO: 12, REPROVADO: 2,
    APROVADO: 4, EM_MANUTENCAO: 2, AGUARDANDO_PECA: 3, PRONTO: 5, ENTREGUE: 40, ABANDONADO: 1,
  });
  mocks.db.listarMovimentoBancada.mockResolvedValue([
    { status: "ENTREGUE", data_entrada: "2026-11-01", data_saida: "2026-11-22 11:36:00.123456+00", data_reprovacao: null },
    { status: "REPROVADO", data_entrada: "2026-11-02", data_saida: null, data_reprovacao: "2026-11-10 10:00:00+00" },
  ]);
});

describe("Início", () => {
  it("conta pelas mesmas contagens por status das pílulas, não pela lista de 50", async () => {
    render(<Dashboard />);
    const aprovacao = await screen.findByRole("button", { name: /Aguardando aprovação/ });
    expect(aprovacao).toHaveTextContent("12");
    expect(screen.getByRole("button", { name: /Prontos para entrega/ })).toHaveTextContent("5");
    expect(screen.getByRole("button", { name: /Aguardando peça/ })).toHaveTextContent("3");
    // Em atendimento: tudo menos Entregue e Abandonado.
    expect(screen.getByRole("button", { name: /Em atendimento/ })).toHaveTextContent("32");
    expect(mocks.db.listarMovimentoBancada).toHaveBeenCalledWith(2024, 2027, false);
  });

  it("entregas e reprovações do mês vêm das datas de todas as OS", async () => {
    render(<Dashboard />);
    const entregues = await screen.findByText("Entregues em novembro");
    expect(entregues.parentElement).toHaveTextContent("1");
    expect(screen.getByText("Reprovados em novembro").parentElement).toHaveTextContent("1");
  });

  it("cada etapa da fila abre a lista com todos os status que ela soma", async () => {
    render(<Dashboard />);
    const manutencao = await screen.findByRole("button", { name: /^Manutenção/ });
    expect(within(manutencao).getByText("9")).toBeInTheDocument();
    await userEvent.click(manutencao);
    expect(mocks.navigate).toHaveBeenCalledWith("/equipamentos", { state: { statusFiltro: "APROVADO,EM_MANUTENCAO,AGUARDANDO_PECA" } });

    const orcamento = screen.getByRole("button", { name: /^Orçamento/ });
    expect(within(orcamento).getByText("15")).toBeInTheDocument();
    await userEvent.click(orcamento);
    expect(mocks.navigate).toHaveBeenLastCalledWith("/equipamentos", { state: { statusFiltro: "VERIFICADO,AGUARDANDO_APROVACAO,REPROVADO,ORCAMENTO_VENCIDO" } });
  });

  it("o cartão Em atendimento abre a lista sem Entregue nem Abandonado", async () => {
    render(<Dashboard />);
    await userEvent.click(await screen.findByRole("button", { name: /Em atendimento/ }));
    const filtro = mocks.navigate.mock.calls[0][1].state.statusFiltro as string;
    expect(filtro.split(",")).not.toContain("ENTREGUE");
    expect(filtro.split(",")).not.toContain("ABANDONADO");
    expect(filtro.split(",")).toContain("AGUARDANDO_PECA");
  });

  it("recarga ao vivo antiga que termina por último não volta os números", async () => {
    render(<Dashboard />);
    const aprovacao = await screen.findByRole("button", { name: /Aguardando aprovação/ });
    expect(aprovacao).toHaveTextContent("12");

    let resolverPrimeira: (valor: Record<string, number>) => void = () => undefined;
    let resolverSegunda: (valor: Record<string, number>) => void = () => undefined;
    mocks.db.contarEquipamentosPorStatus
      .mockImplementationOnce(() => new Promise((resolve) => { resolverPrimeira = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolverSegunda = resolve; }));

    act(() => { mocks.aoVivo?.(); });
    act(() => { mocks.aoVivo?.(); });
    expect(mocks.db.contarEquipamentosPorStatus).toHaveBeenCalledTimes(3);

    await act(async () => { resolverSegunda({ AGUARDANDO_APROVACAO: 30, PRONTO: 7 }); });
    expect(screen.getByRole("button", { name: /Aguardando aprovação/ })).toHaveTextContent("30");

    await act(async () => { resolverPrimeira({ AGUARDANDO_APROVACAO: 20, PRONTO: 6 }); });
    expect(screen.getByRole("button", { name: /Aguardando aprovação/ })).toHaveTextContent("30");
    expect(screen.getByRole("button", { name: /Prontos para entrega/ })).toHaveTextContent("7");
  });

  it("recarga ao vivo que falha mantém os números na tela", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<Dashboard />);
    expect(await screen.findByRole("button", { name: /Aguardando aprovação/ })).toHaveTextContent("12");
    mocks.db.contarEquipamentosPorStatus.mockRejectedValueOnce(new Error("rede"));
    await act(async () => { mocks.aoVivo?.(); });
    expect(screen.getByRole("button", { name: /Aguardando aprovação/ })).toHaveTextContent("12");
    expect(screen.queryByLabelText("Carregando início")).not.toBeInTheDocument();
  });

  it("mudança durante a primeira carga vira uma recarga silenciosa no fim dela", async () => {
    let resolverInicial: (valor: Record<string, number>) => void = () => undefined;
    mocks.db.contarEquipamentosPorStatus
      .mockImplementationOnce(() => new Promise((resolve) => { resolverInicial = resolve; }))
      .mockResolvedValueOnce({ AGUARDANDO_APROVACAO: 9 });
    render(<Dashboard />);
    act(() => { mocks.aoVivo?.(); });
    expect(mocks.db.contarEquipamentosPorStatus).toHaveBeenCalledTimes(1);
    await act(async () => { resolverInicial({ AGUARDANDO_APROVACAO: 4 }); });
    expect(mocks.db.contarEquipamentosPorStatus).toHaveBeenCalledTimes(2);
    expect(mocks.db.contarEquipamentosPorStatus).toHaveBeenLastCalledWith(undefined, undefined, true);
    expect(await screen.findByRole("button", { name: /Aguardando aprovação/ })).toHaveTextContent("9");
  });
});
