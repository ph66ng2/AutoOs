import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { Equipamento, Verificacao } from "@/types";

beforeAll(() => {
  vi.stubGlobal(
    "Image",
    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = "";
      constructor() {
        queueMicrotask(() => {
          if (this.onerror) this.onerror();
        });
      }
    }
  );
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("mock fetch")));
});

const mockText = vi.hoisted(() => vi.fn());
const mockSetFont = vi.hoisted(() => vi.fn());
const mockSetFontSize = vi.hoisted(() => vi.fn());
const mockSetTextColor = vi.hoisted(() => vi.fn());
const mockSetFillColor = vi.hoisted(() => vi.fn());
const mockRect = vi.hoisted(() => vi.fn());
const mockRoundedRect = vi.hoisted(() => vi.fn());
const mockAddImage = vi.hoisted(() => vi.fn());
const mockOutput = vi.hoisted(() => vi.fn().mockReturnValue(new ArrayBuffer(8)));
const mockGetNumberOfPages = vi.hoisted(() => vi.fn().mockReturnValue(1));
const mockSetPage = vi.hoisted(() => vi.fn());
const mockAddPage = vi.hoisted(() => vi.fn());
const mockSplitTextToSize = vi.hoisted(() => vi.fn().mockReturnValue([""]));

const mockJsPDF = vi.hoisted(() =>
  vi.fn(function () {
    return {
      text: mockText,
      setFont: mockSetFont,
      setFontSize: mockSetFontSize,
      setTextColor: mockSetTextColor,
      setFillColor: mockSetFillColor,
      rect: mockRect,
      roundedRect: mockRoundedRect,
      addImage: mockAddImage,
      output: mockOutput,
      getNumberOfPages: mockGetNumberOfPages,
      setPage: mockSetPage,
      addPage: mockAddPage,
      splitTextToSize: mockSplitTextToSize,
      internal: {
        pageSize: {
          getHeight: () => 297,
          getWidth: () => 210,
        },
      },
    };
  })
);

vi.mock("jspdf", () => ({
  jsPDF: mockJsPDF,
}));

vi.mock("jspdf-autotable", () => ({
  default: vi.fn((doc: { lastAutoTable?: { finalY: number } }) => {
    doc.lastAutoTable = { finalY: 100 };
  }),
}));

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockListarImagens = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("@/lib/db", () => ({
  db: {
    listarImagensEquipamento: mockListarImagens,
  },
}));

vi.mock("@/lib/logo-base64", () => ({
  LOGO_BMITAG_BASE64: "fakebase64",
}));

vi.mock("@/lib/equipamento-imagem-utils", () => ({
  bytesParaDataUrl: vi.fn().mockResolvedValue("data:image/png;base64,fake"),
}));

import { PdfService } from "@/lib/pdf-service";

describe("PdfService.gerarOrcamentoAjustado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
    mockOutput.mockReturnValue(new ArrayBuffer(8));
    mockGetNumberOfPages.mockReturnValue(1);
    mockInvoke.mockResolvedValue("/tmp/orcamento.pdf");
  });

  const equipamentoBase: Equipamento = {
    id: 1,
    serial_number: "SN123",
    marca: "Zebra",
    modelo: "ZT230",
    tipo: "Impressora",
    status: "AGUARDANDO_APROVACAO",
    data_entrada: "2026-06-26",
    cliente_nome: "Cliente Teste",
  };

  const verificacaoBase: Verificacao = {
    id: 1,
    equipamento_id: 1,
    tecnico_nome: "Ivan",
    problema_relatado: "Teste",
    servicos_necessarios: JSON.stringify([
      { id: "s1", catalogo_id: 1, descricao: "Limpeza", valor: 100 },
    ]),
    pecas_necessarias: JSON.stringify([]),
    custo_total: 100,
    adjusted_at: "2026-06-26T10:30:00",
  };

  it("deve existir como metodo do PdfService", () => {
    expect(typeof PdfService.gerarOrcamentoAjustado).toBe("function");
  });

  it("deve adicionar 'VERSÃO AJUSTADA' no cabecalho quando adjusted_at esta definido", async () => {
    await PdfService.gerarOrcamentoAjustado(equipamentoBase, verificacaoBase);
    const textCalls = mockText.mock.calls as [string, number, number, object?][];
    const hasVersaoAjustada = textCalls.some((call) => call[0] === "VERSÃO AJUSTADA");
    expect(hasVersaoAjustada).toBe(true);
  });

  it("deve adicionar 'Versão Ajustada em' no rodape quando adjusted_at esta definido", async () => {
    await PdfService.gerarOrcamentoAjustado(equipamentoBase, verificacaoBase);
    const textCalls = mockText.mock.calls as [string, number, number, object?][];
    const hasFooter = textCalls.some(
      (call) => typeof call[0] === "string" && call[0].includes("Versão Ajustada em")
    );
    expect(hasFooter).toBe(true);
  });

  it("deve usar formato DD/MM/YYYY HH:MM no rodape de versao ajustada", async () => {
    await PdfService.gerarOrcamentoAjustado(equipamentoBase, verificacaoBase);
    const textCalls = mockText.mock.calls as [string, number, number, object?][];
    const footerCall = textCalls.find(
      (call) => typeof call[0] === "string" && call[0].includes("Versão Ajustada em")
    );
    expect(footerCall).toBeDefined();
    expect(footerCall![0]).toMatch(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  });

  it("nao deve adicionar 'VERSÃO AJUSTADA' quando adjusted_at eh nulo", async () => {
    const verificacaoSemAjuste: Verificacao = { ...verificacaoBase, adjusted_at: undefined };
    await PdfService.gerarOrcamentoAjustado(equipamentoBase, verificacaoSemAjuste);
    const textCalls = mockText.mock.calls as [string, number, number, object?][];
    const hasVersaoAjustada = textCalls.some((call) => call[0] === "VERSÃO AJUSTADA");
    expect(hasVersaoAjustada).toBe(false);
  });

  it("nao deve adicionar 'VERSÃO AJUSTADA' quando adjusted_at eh string vazia", async () => {
    const verificacaoSemAjuste: Verificacao = { ...verificacaoBase, adjusted_at: "" };
    await PdfService.gerarOrcamentoAjustado(equipamentoBase, verificacaoSemAjuste);
    const textCalls = mockText.mock.calls as [string, number, number, object?][];
    const hasVersaoAjustada = textCalls.some((call) => call[0] === "VERSÃO AJUSTADA");
    expect(hasVersaoAjustada).toBe(false);
  });

  it("deve mostrar alerta e retornar null quando ha divergencia entre soma e custo_total", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const verificacaoDivergente: Verificacao = {
      ...verificacaoBase,
      servicos_necessarios: JSON.stringify([
        { id: "s1", catalogo_id: 1, descricao: "Limpeza", valor: 100 },
      ]),
      custo_total: 200,
    };
    const result = await PdfService.gerarOrcamentoAjustado(
      equipamentoBase,
      verificacaoDivergente
    );
    expect(alertSpy).toHaveBeenCalled();
    expect(result).toBeNull();
    alertSpy.mockRestore();
  });

  it("deve gerar PDF normalmente quando nao ha divergencia", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const result = await PdfService.gerarOrcamentoAjustado(
      equipamentoBase,
      verificacaoBase
    );
    expect(alertSpy).not.toHaveBeenCalled();
    expect(result).toBe("/tmp/orcamento.pdf");
    alertSpy.mockRestore();
  });

  it("deve detectar divergencia incluindo pecas na soma", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const verificacaoComPeca: Verificacao = {
      ...verificacaoBase,
      servicos_necessarios: JSON.stringify([
        { id: "s1", catalogo_id: 1, descricao: "Limpeza", valor: 100 },
      ]),
      pecas_necessarias: JSON.stringify([
        { id: "p1", nome: "Rolo", quantidade: 1, valorUnitario: 50, valorTotal: 50 },
      ]),
      custo_total: 100,
    };
    const result = await PdfService.gerarOrcamentoAjustado(
      equipamentoBase,
      verificacaoComPeca
    );
    expect(alertSpy).toHaveBeenCalled();
    expect(result).toBeNull();
    alertSpy.mockRestore();
  });

  it("deve permitir gerar PDF quando soma de servicos e pecas bate com custo_total", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const verificacaoComPeca: Verificacao = {
      ...verificacaoBase,
      servicos_necessarios: JSON.stringify([
        { id: "s1", catalogo_id: 1, descricao: "Limpeza", valor: 100 },
      ]),
      pecas_necessarias: JSON.stringify([
        { id: "p1", nome: "Rolo", quantidade: 1, valorUnitario: 50, valorTotal: 50 },
      ]),
      custo_total: 150,
    };
    const result = await PdfService.gerarOrcamentoAjustado(
      equipamentoBase,
      verificacaoComPeca
    );
    expect(alertSpy).not.toHaveBeenCalled();
    expect(result).toBe("/tmp/orcamento.pdf");
    alertSpy.mockRestore();
  });
});
