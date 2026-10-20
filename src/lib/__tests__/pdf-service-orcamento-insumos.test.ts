import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrcamentoInsumosDetalhe } from "@/types";

const mockText = vi.hoisted(() => vi.fn());
const mockOutput = vi.hoisted(() => vi.fn().mockReturnValue(new ArrayBuffer(8)));
const mockAddPage = vi.hoisted(() => vi.fn());
const mockAutoTable = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());
const noop = vi.hoisted(() => vi.fn());

const mockJsPDF = vi.hoisted(() =>
  vi.fn(function () {
    return {
      text: mockText,
      setFont: noop,
      setFontSize: noop,
      setTextColor: noop,
      setFillColor: noop,
      setDrawColor: noop,
      setLineWidth: noop,
      line: noop,
      rect: noop,
      roundedRect: noop,
      addImage: noop,
      output: mockOutput,
      getNumberOfPages: () => 1,
      setPage: noop,
      addPage: mockAddPage,
      splitTextToSize: (texto: string) => [texto],
      getTextWidth: () => 20,
      internal: { pageSize: { getHeight: () => 297, getWidth: () => 210 } },
    };
  }),
);

vi.mock("jspdf", () => ({ jsPDF: mockJsPDF }));
vi.mock("jspdf-autotable", () => ({
  default: vi.fn((doc: { lastAutoTable?: { finalY: number } }, options: unknown) => {
    mockAutoTable(doc, options);
    doc.lastAutoTable = { finalY: 100 };
  }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/logo-monochrome-base64", () => ({ LOGO_BMITAG_MONOCHROME_PNG_BASE64: "fakebase64" }));

import { PdfService } from "@/lib/pdf-service";

function orcamento(sobrescrever: Partial<OrcamentoInsumosDetalhe> = {}): OrcamentoInsumosDetalhe {
  return {
    id: 7,
    empresa_id: 1,
    numero: 12,
    numero_exibicao: "OI-12",
    cliente_id: 3,
    cliente_nome: "Gráfica Alfa Ltda",
    cliente_documento: "57522734000158",
    contato_id: 4,
    contato_nome: "Maria Souza",
    contato_email: "maria@alfa.test",
    contato_telefone: "71999990000",
    status: "RASCUNHO",
    validade: "2026-11-01",
    observacoes: "Retirar no balcão",
    desconto: 5,
    valor_subtotal: 105,
    valor_total: 100,
    criado_em: "2026-10-20 14:03:05.123456+00",
    atualizado_em: "2026-10-20 14:03:05.123456+00",
    total_itens: 2,
    itens: [
      { id: 1, orcamento_id: 7, produto_id: 10, descricao: "Etiqueta 100x50", categoria: "ETIQUETA", quantidade: 3, valor_unitario: 15, valor_total: 45 },
      { id: 2, orcamento_id: 7, produto_id: 11, descricao: "Ribbon cera", categoria: "RIBBON", quantidade: 2, valor_unitario: 30, valor_total: 60 },
    ],
    ...sobrescrever,
  };
}

function textosEscritos(): string[] {
  return mockText.mock.calls.map((chamada) => (Array.isArray(chamada[0]) ? chamada[0].join(" ") : String(chamada[0])));
}

function tabela(cabecalho: string): { body: string[][]; head?: string[][] } {
  const chamada = mockAutoTable.mock.calls.find(([, opcoes]) => JSON.stringify((opcoes as { head?: unknown }).head ?? "").includes(cabecalho));
  if (!chamada) throw new Error(`tabela com "${cabecalho}" não foi gerada`);
  return chamada[1] as { body: string[][] };
}

describe("PdfService.construirOrcamentoInsumos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOutput.mockReturnValue(new ArrayBuffer(8));
    mockInvoke.mockResolvedValue("/tmp/Orcamento_Insumos_OI-12.pdf");
  });

  it("monta cabeçalho com o número OI e o título próprio, sem 'Número da OS'", async () => {
    const artefato = await PdfService.construirOrcamentoInsumos(orcamento());
    const textos = textosEscritos();
    expect(mockJsPDF).toHaveBeenCalledWith({ orientation: "portrait", unit: "mm", format: "a4" });
    expect(textos).toContain("ORÇAMENTO DE INSUMOS");
    expect(textos).toContain("OI-12");
    expect(textos).toContain("Número do orçamento");
    expect(textos).not.toContain("Número da OS");
    expect(textos).toContain("BMITAG TECNOLOGIA QRCODE E RFID");
    expect(artefato.mimeType).toBe("application/pdf");
    expect(artefato.filename).toBe("Orcamento_Insumos_OI-12_Grafica_Alfa_Ltda.pdf");
    expect(artefato.bytes).toBeInstanceOf(Uint8Array);
  });

  it("mostra cliente com CNPJ formatado, responsável e contato", async () => {
    await PdfService.construirOrcamentoInsumos(orcamento());
    const cliente = tabela("CLIENTE");
    expect(cliente.body[0][0]).toBe("Gráfica Alfa Ltda - CNPJ: 57.522.734/0001-58");
    expect(cliente.body[0][1]).toBe("Maria Souza");
    expect(cliente.body[0][2]).toBe("maria@alfa.test\n71999990000");
  });

  it("usa CPF quando o documento tem 11 dígitos", async () => {
    await PdfService.construirOrcamentoInsumos(orcamento({ cliente_documento: "52998224725", contato_id: null, contato_nome: null, contato_email: null, contato_telefone: null }));
    expect(tabela("CLIENTE").body[0][0]).toBe("Gráfica Alfa Ltda - CPF: 529.982.247-25");
  });

  it("lista itens com quantidade, valor unitário e total vindos do backend", async () => {
    await PdfService.construirOrcamentoInsumos(orcamento());
    const itens = tabela("Descrição").body;
    expect(itens).toHaveLength(2);
    expect(itens[0][0]).toBe("Etiqueta 100x50");
    expect(itens[0][1]).toBe("ETIQUETA");
    expect(itens[0][2]).toBe("03");
    expect(itens[0][3].replace(/\s/g, " ")).toBe("R$ 15,00");
    expect(itens[0][4].replace(/\s/g, " ")).toBe("R$ 45,00");
    expect(itens[1][0]).toBe("Ribbon cera");
  });

  it("com desconto mostra subtotal, desconto e total; sem desconto só o total", async () => {
    await PdfService.construirOrcamentoInsumos(orcamento());
    const comDesconto = mockAutoTable.mock.calls
      .map(([, opcoes]) => (opcoes as { body: string[][] }).body)
      .find((corpo) => corpo.some((linha) => linha[0] === "VALOR TOTAL:"))!;
    expect(comDesconto.map((linha) => linha[0])).toEqual(["SUBTOTAL:", "DESCONTO:", "VALOR TOTAL:"]);
    expect(comDesconto[1][1].replace(/\s/g, " ")).toBe("- R$ 5,00");
    expect(comDesconto[2][1].replace(/\s/g, " ")).toBe("R$ 100,00");

    mockAutoTable.mockClear();
    await PdfService.construirOrcamentoInsumos(orcamento({ desconto: 0, valor_subtotal: 105, valor_total: 105 }));
    const semDesconto = mockAutoTable.mock.calls
      .map(([, opcoes]) => (opcoes as { body: string[][] }).body)
      .find((corpo) => corpo.some((linha) => linha[0] === "VALOR TOTAL:"))!;
    expect(semDesconto.map((linha) => linha[0])).toEqual(["VALOR TOTAL:"]);
  });

  it("inclui validade, forma de pagamento e observações", async () => {
    await PdfService.construirOrcamentoInsumos(orcamento({ forma_pagamento_codigo: "PIX" }));
    const textos = textosEscritos();
    expect(textos).toContain("Válido até 01/11/2026.");
    expect(textos).toContain("Pix");
    expect(textos).toContain("Faturamento:");
    expect(textos).toContain("Retirar no balcão");
  });

  it("sem forma de pagamento diz que será definida na aprovação", async () => {
    await PdfService.construirOrcamentoInsumos(orcamento({ observacoes: null }));
    const textos = textosEscritos();
    expect(textos).toContain("Definida no momento da aprovação.");
    expect(textos).not.toContain("OBSERVAÇÕES");
  });

  it("salva pelo comando de orçamentos com o nome do arquivo do documento", async () => {
    const dados = orcamento();
    const artefato = await PdfService.construirOrcamentoInsumos(dados);
    const caminho = await PdfService.salvarOrcamentoInsumos(artefato, dados);
    expect(caminho).toBe("/tmp/Orcamento_Insumos_OI-12.pdf");
    expect(mockInvoke).toHaveBeenCalledWith("salvar_orcamento_pdf", {
      bytes: Array.from(artefato.bytes),
      empresaNome: "Gráfica Alfa Ltda",
      nomeArquivo: artefato.filename,
    });
  });
});
