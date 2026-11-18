import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  db: {
    listarGastosFixos: vi.fn(),
    listarGastosVariaveis: vi.fn(),
    resumoMensal: vi.fn(),
    listarEquipamentos: vi.fn(),
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
  mocks.db.listarEquipamentos.mockResolvedValue([
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
  });

  it("Recarregar busca de novo o gráfico anual", async () => {
    const usuario = userEvent.setup();
    render(<Gastos />);
    await screen.findByRole("region", { name: "Gastos fixos" });
    const chamadas = mocks.db.listarEquipamentos.mock.calls.length;
    await usuario.click(screen.getByRole("button", { name: "Recarregar" }));
    await waitFor(() => expect(mocks.db.listarEquipamentos.mock.calls.length).toBeGreaterThan(chamadas));
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
