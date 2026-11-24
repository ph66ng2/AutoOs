import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  db: {
    listarGastosFixos: vi.fn(),
    listarGastosVariaveis: vi.fn(),
    resumoMensal: vi.fn(),
    listarReceitaAprovada: vi.fn(),
    salvarArquivoTemp: vi.fn(),
  },
  success: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ ensureSensitiveAccess: vi.fn().mockResolvedValue(true) }) }));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ error: vi.fn(), success: mocks.success, warning: vi.fn() }) }));
vi.mock("recharts", async (original) => {
  const real = await original<typeof import("recharts")>();
  return { ...real, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div style={{ width: 800, height: 300 }}>{children}</div> };
});

import Gastos from "./Gastos";
import { distribuirMudancas } from "@/lib/ao-vivo";

const fixos = [
  { id: 1, nome: "Folha", valor: 4800, vencimento_dia: 5, categoria: "Folha", ativo: true },
  { id: 2, nome: "Aluguel da loja", valor: 3200, vencimento_dia: 10, categoria: "Aluguel", ativo: true },
];
const variaveis = [
  { id: 11, descricao: "Etiquetas", valor: 2000, data: "2026-11-09", categoria: "Fornecedores" },
];

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T12:00:00"));
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});
afterAll(() => vi.useRealTimers());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.listarGastosFixos.mockResolvedValue(fixos);
  mocks.db.listarGastosVariaveis.mockResolvedValue(variaveis);
  // O resumo pode vir zerado: os totais do mês saem das listas.
  mocks.db.resumoMensal.mockImplementation(async (mes: number) => ({ total_fixo: 0, total_variavel: mes === 10 ? 1000 : 0, total_geral: 0, por_categoria: [] }));
  mocks.db.listarReceitaAprovada.mockResolvedValue([
    { id: 1, serial_number: "A", marca: "Z", modelo: "Z", tipo: "Impressora", status: "ENTREGUE", data_entrada: "2026-11-01", data_aprovacao: "2026-11-10", valor_orcamento: 12000 },
    { id: 2, serial_number: "B", marca: "Z", modelo: "Z", tipo: "Impressora", status: "ENTREGUE", data_entrada: "2026-10-01", data_aprovacao: "2026-10-10", valor_orcamento: 9000 },
  ]);
  mocks.db.salvarArquivoTemp.mockResolvedValue("/tmp/x.csv");
});

describe("Finanças (fase 8)", () => {
  it("números do mês com dado real: fixos, variáveis da lista, saldo e maior categoria", async () => {
    render(<Gastos />);
    const fixosCartao = await screen.findByRole("region", { name: "Gastos fixos" });
    await waitFor(() => expect(fixosCartao).toHaveTextContent(/R\$\s*8\.000,00/));
    expect(fixosCartao).toHaveTextContent("2 gastos fixos no mês");
    expect(screen.getByRole("region", { name: "Gastos variáveis" })).toHaveTextContent(/R\$\s*2\.000,00/);
    const saldo = screen.getByRole("region", { name: "Saldo do mês" });
    // 12.000 faturado − 10.000 gastos; outubro: 9.000 − (8.000 + 1.000) = 0.
    await waitFor(() => expect(saldo).toHaveTextContent(/\+R\$\s*2\.000,00/));
    expect(saldo).toHaveTextContent(/vs\. outubro/);
    const maior = screen.getByRole("region", { name: "Maior categoria" });
    expect(maior).toHaveTextContent("Folha");
    expect(maior).toHaveTextContent("48% dos gastos");
    expect(screen.getByRole("heading", { name: "Peso no faturamento" }).closest("section")).toHaveTextContent("83% em gastos");
  });

  it("atualiza gastos e saldo ao vivo com leituras em segundo plano", async () => {
    render(<Gastos />);
    const saldo = screen.getByRole("region", { name: "Saldo do mês" });
    await waitFor(() => expect(saldo).toHaveTextContent(/\+R\$\s*2\.000,00/));

    mocks.db.listarReceitaAprovada.mockClear();
    mocks.db.listarGastosFixos.mockResolvedValueOnce([{ ...fixos[0], valor: 8500 }]);
    await act(async () => distribuirMudancas([{ tabela: "gastos_fixos", id: null, referencia: null, operacao: "U" }]));
    expect(mocks.db.listarGastosFixos).toHaveBeenLastCalledWith(true);
    expect(mocks.db.resumoMensal).toHaveBeenLastCalledWith(11, 2026, true);
    expect(mocks.db.listarReceitaAprovada).not.toHaveBeenCalled();
    expect(saldo).toHaveTextContent(/\+R\$\s*1\.500,00/);

    mocks.db.listarGastosVariaveis.mockResolvedValueOnce([{ ...variaveis[0], valor: 3000 }]);
    await act(async () => distribuirMudancas([{ tabela: "gastos_variaveis", id: null, referencia: null, operacao: "I" }]));
    expect(mocks.db.listarGastosVariaveis).toHaveBeenLastCalledWith(11, 2026, true);
    expect(mocks.db.listarReceitaAprovada).toHaveBeenLastCalledWith(2024, 2027, true);
    expect(saldo).toHaveTextContent(/\+R\$\s*500,00/);
  });

  it("identifica o mês de corte do faturamento acumulado", async () => {
    const usuario = userEvent.setup();
    render(<Gastos />);
    const painel = screen.getByRole("region", { name: "Faturamento e gastos" });
    expect(within(painel).getByText("Faturado no ano (até novembro)")).toBeInTheDocument();

    await usuario.click(screen.getByRole("combobox", { name: "Mês" }));
    await usuario.click(await screen.findByRole("option", { name: "Outubro, 2026" }));

    expect(within(painel).getByText("Faturado no ano (até outubro)")).toBeInTheDocument();
  });

  it("saldo e peso ficam indisponíveis se o faturado do ano não carrega", async () => {
    mocks.db.listarReceitaAprovada.mockRejectedValue(new Error("rede"));
    render(<Gastos />);
    const saldo = await screen.findByRole("region", { name: "Saldo do mês" });
    await waitFor(() => expect(saldo).toHaveTextContent("Indisponível"));
    expect(saldo).not.toHaveTextContent(/10\.000,00/);
    expect(screen.getByRole("heading", { name: "Peso no faturamento" }).closest("section")).toHaveTextContent("Indisponível");
  });

  it("o olho oculta os valores; Ver todas abre a lista completa", async () => {
    const usuario = userEvent.setup();
    render(<Gastos />);
    const fixosCartao = await screen.findByRole("region", { name: "Gastos fixos" });
    await waitFor(() => expect(fixosCartao).toHaveTextContent(/8\.000,00/));
    await usuario.click(screen.getByRole("button", { name: "Ocultar valores" }));
    expect(fixosCartao).toHaveTextContent("R$ •••••");
    expect(fixosCartao).not.toHaveTextContent(/8\.000,00/);
    await usuario.click(screen.getByRole("button", { name: "Ver todas" }));
    const janela = await screen.findByRole("dialog");
    expect(within(janela).getByText("Etiquetas")).toBeInTheDocument();
    expect(janela).not.toHaveTextContent(/4\.800,00|3\.200,00|2\.000,00/);
    expect(within(janela).getAllByText("R$ •••••")).toHaveLength(3);
  });

  it("Recarregar busca de novo o gráfico anual", async () => {
    const usuario = userEvent.setup();
    render(<Gastos />);
    await screen.findByRole("region", { name: "Gastos fixos" });
    const chamadas = mocks.db.listarReceitaAprovada.mock.calls.length;
    await usuario.click(screen.getByRole("button", { name: "Recarregar" }));
    await waitFor(() => expect(mocks.db.listarReceitaAprovada.mock.calls.length).toBeGreaterThan(chamadas));
  });

  it("não exporta enquanto os lançamentos do mês ainda carregam", async () => {
    let liberar!: (valor: typeof variaveis) => void;
    mocks.db.listarGastosVariaveis.mockReturnValueOnce(new Promise((resolve) => { liberar = resolve; }));
    render(<Gastos />);
    expect(screen.getByRole("button", { name: "Baixar lançamentos do mês (CSV)" })).toBeDisabled();
    expect(mocks.db.salvarArquivoTemp).not.toHaveBeenCalled();
    liberar(variaveis);
    await waitFor(() => expect(screen.getByRole("button", { name: "Baixar lançamentos do mês (CSV)" })).toBeEnabled());
  });

  it("baixa os lançamentos do mês em CSV", async () => {
    const usuario = userEvent.setup();
    render(<Gastos />);
    await screen.findByRole("region", { name: "Gastos fixos" });
    await usuario.click(screen.getByRole("button", { name: "Baixar lançamentos do mês (CSV)" }));
    await waitFor(() => expect(mocks.db.salvarArquivoTemp).toHaveBeenCalled());
    const [bytes, nome] = mocks.db.salvarArquivoTemp.mock.calls[0];
    expect(nome).toBe("financas-2026-11.csv");
    const texto = new TextDecoder().decode(new Uint8Array(bytes));
    expect(texto).toContain('"variável","Etiquetas","Fornecedores","2026-11-09","2000.00"');
  });
});
