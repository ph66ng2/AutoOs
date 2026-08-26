import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Equipamento, EquipamentoImagem, Verificacao } from "@/types";

const mockText = vi.hoisted(() => vi.fn());
const mockSetFont = vi.hoisted(() => vi.fn());
const mockSetFontSize = vi.hoisted(() => vi.fn());
const mockSetTextColor = vi.hoisted(() => vi.fn());
const mockSetFillColor = vi.hoisted(() => vi.fn());
const mockSetDrawColor = vi.hoisted(() => vi.fn());
const mockSetLineWidth = vi.hoisted(() => vi.fn());
const mockLine = vi.hoisted(() => vi.fn());
const mockRect = vi.hoisted(() => vi.fn());
const mockRoundedRect = vi.hoisted(() => vi.fn());
const mockAddImage = vi.hoisted(() => vi.fn());
const mockOutput = vi.hoisted(() => vi.fn().mockReturnValue(new ArrayBuffer(8)));
const mockGetNumberOfPages = vi.hoisted(() => vi.fn().mockReturnValue(1));
const mockSetPage = vi.hoisted(() => vi.fn());
const mockAddPage = vi.hoisted(() => vi.fn());
const mockSplitTextToSize = vi.hoisted(() => vi.fn((texto: string) => [texto]));
const mockGetTextWidth = vi.hoisted(() => vi.fn().mockReturnValue(20));
const mockAutoTable = vi.hoisted(() => vi.fn());
const mockBuscarVerificacao = vi.hoisted(() => vi.fn());

const mockJsPDF = vi.hoisted(() =>
  vi.fn(function () {
    return {
      text: mockText,
      setFont: mockSetFont,
      setFontSize: mockSetFontSize,
      setTextColor: mockSetTextColor,
      setFillColor: mockSetFillColor,
      setDrawColor: mockSetDrawColor,
      setLineWidth: mockSetLineWidth,
      line: mockLine,
      rect: mockRect,
      roundedRect: mockRoundedRect,
      addImage: mockAddImage,
      output: mockOutput,
      getNumberOfPages: mockGetNumberOfPages,
      setPage: mockSetPage,
      addPage: mockAddPage,
      splitTextToSize: mockSplitTextToSize,
      getTextWidth: mockGetTextWidth,
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
  default: vi.fn((doc: { lastAutoTable?: { finalY: number } }, options: unknown) => {
    mockAutoTable(doc, options);
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
    buscarVerificacao: mockBuscarVerificacao,
  },
}));

vi.mock("@/lib/logo-monochrome-base64", () => ({
  LOGO_BMITAG_MONOCHROME_PNG_BASE64: "fakebase64",
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
    mockBuscarVerificacao.mockResolvedValue(null);
    mockAutoTable.mockReset();
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

  it.each([
    ["orçamento", () => PdfService.gerarOrcamento(equipamentoBase, verificacaoBase), "ORÇAMENTO TÉCNICO", "Emissão"],
    ["orçamento ajustado", () => PdfService.gerarOrcamentoAjustado(equipamentoBase, verificacaoBase), "ORÇAMENTO AJUSTADO", "Emissão"],
    ["ordem de serviço", () => PdfService.gerarOrdemServico(equipamentoBase), "ORDEM DE SERVIÇO", "Entrada"],
    ["relatório de status", () => PdfService.gerarRelatorioStatus(equipamentoBase), "RELATÓRIO DE STATUS", "Entrada"],
  ])("envia título, OS e rótulo de data ao cabeçalho do %s", async (_nome, gerar, titulo, rotuloData) => {
    await gerar();

    const textos = mockText.mock.calls.map(([texto]) => String(texto));
    expect(textos).toContain(titulo);
    expect(textos).toContain("OS-00001");
    expect(textos).toContain(rotuloData);
    expect(textos.some((texto) => texto.includes("Página 1/1"))).toBe(true);
  });

  it("usa cabeçalhos e estilos sem preenchimento escuro", async () => {
    await PdfService.gerarOrcamento(equipamentoBase, verificacaoBase);

    for (const [, options] of mockAutoTable.mock.calls as [unknown, Record<string, unknown>][]) {
      const styles = options.styles as { fillColor?: number[]; textColor?: number[] };
      const headStyles = options.headStyles as { fillColor?: number[]; textColor?: number[] };
      expect(styles.fillColor).toEqual([255, 255, 255]);
      expect(headStyles.fillColor).toEqual([255, 255, 255]);
      expect(headStyles.textColor).toEqual([0, 0, 0]);
    }
  });

  it("remove OS e data dos corpos de OS e relatório, mantendo status", async () => {
    await PdfService.gerarOrcamento(equipamentoBase, verificacaoBase);
    const corpoOrcamento = JSON.stringify(mockAutoTable.mock.calls.map(([, options]) => options));
    expect(corpoOrcamento).not.toContain("OS-00001");
    expect(corpoOrcamento).not.toContain("Salvador");

    mockAutoTable.mockReset();
    await PdfService.gerarOrcamentoAjustado(equipamentoBase, verificacaoBase);
    const corpoOrcamentoAjustado = JSON.stringify(mockAutoTable.mock.calls.map(([, options]) => options));
    expect(corpoOrcamentoAjustado).not.toContain("OS-00001");
    expect(corpoOrcamentoAjustado).not.toContain("Salvador");

    mockAutoTable.mockReset();
    await PdfService.gerarOrdemServico(equipamentoBase);
    const corpoOS = JSON.stringify(mockAutoTable.mock.calls.map(([, options]) => options));
    expect(corpoOS).not.toContain("Ordem");
    expect(corpoOS).not.toContain("Data de entrada");
    expect(corpoOS).toContain("STATUS ATUAL");

    mockAutoTable.mockReset();
    await PdfService.gerarRelatorioStatus(equipamentoBase);
    const corpoRelatorio = JSON.stringify(mockAutoTable.mock.calls.map(([, options]) => options));
    expect(corpoRelatorio).not.toContain("Ordem");
    expect(corpoRelatorio).not.toContain("Data de entrada");
    expect(corpoRelatorio).toContain("Status atual");
  });

  it("mantém os dados comerciais atuais sem prioridade ou forma de pagamento", async () => {
    await PdfService.gerarOrcamento(equipamentoBase, verificacaoBase);
    const documento = mockText.mock.calls.map(([texto]) => String(texto)).join(" ")
      + JSON.stringify(mockAutoTable.mock.calls);

    expect(documento).toContain("Prazo de Execução:");
    expect(documento).toContain("Faturamento:");
    expect(documento).toContain("Garantia:");
    expect(documento).toContain("Validade do Orçamento:");
    expect(documento).not.toMatch(/prioridade/i);
    expect(documento).not.toMatch(/forma de pagamento/i);
  });

  it("aplica o rodapé textual a todas as páginas", async () => {
    mockGetNumberOfPages.mockReturnValue(3);
    await PdfService.gerarRelatorioStatus(equipamentoBase);

    const rodapes = mockText.mock.calls
      .map(([texto]) => String(texto))
      .filter((texto) => texto.includes("AutoOS |"));
    expect(rodapes).toHaveLength(3);
    expect(rodapes.map((texto) => texto.match(/Página \d+\/3/)?.[0])).toEqual([
      "Página 1/3",
      "Página 2/3",
      "Página 3/3",
    ]);
  });

  it("mantém anexos fotográficos, nomes, legendas e até duas imagens por página", async () => {
    mockGetNumberOfPages.mockReturnValue(3);
    const imagens: EquipamentoImagem[] = [
      {
        equipamento_id: 1,
        categoria: "ENTRADA",
        filename: "entrada-01.jpg",
        mime_type: "image/jpeg",
        tamanho_bytes: 10,
        largura: 1600,
        altura: 900,
        ordem: 0,
        observacao: "Vista frontal",
        storage_path: "data:image/jpeg;base64,entrada",
      },
      {
        equipamento_id: 1,
        categoria: "ENTRADA",
        filename: "entrada-02.jpg",
        mime_type: "image/jpeg",
        tamanho_bytes: 10,
        largura: 900,
        altura: 1600,
        ordem: 1,
        observacao: "Etiqueta lateral",
        storage_path: "data:image/jpeg;base64,entrada2",
      },
      {
        equipamento_id: 1,
        categoria: "VERIFICACAO",
        filename: "verificacao-01.png",
        mime_type: "image/png",
        tamanho_bytes: 10,
        largura: 1000,
        altura: 1000,
        ordem: 0,
        observacao: "Após limpeza",
        storage_path: "data:image/png;base64,verificacao",
      },
    ];
    mockListarImagens.mockResolvedValue(imagens);

    await PdfService.gerarOrdemServico(equipamentoBase);

    const textos = mockText.mock.calls.map(([texto]) => String(texto)).join(" ");
    expect(textos).toContain("Registro Fotográfico de Entrada");
    expect(textos).toContain("entrada-01.jpg");
    expect(textos).toContain("Vista frontal");
    expect(textos).toContain("entrada-02.jpg");
    expect(textos).toContain("Etiqueta lateral");
    expect(textos).toContain("Registro Fotográfico de Verificação");
    expect(textos).toContain("verificacao-01.png");
    expect(textos).toContain("Após limpeza");
    expect(mockAddPage).toHaveBeenCalledTimes(2);
    expect(mockAddImage).toHaveBeenCalledWith(
      "data:image/jpeg;base64,entrada",
      "JPEG",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("organiza a OS em blocos de ficha e preserva os dados disponíveis", async () => {
    const equipamento = {
      ...equipamentoBase,
      cliente_telefone: "+55 71 99999-0000",
      cliente_email: "cliente@example.com",
      defeito_relatado: "Qualidade de impressão irregular",
      acessorios: "Cabo de energia",
      acessorios_outros: "Manual",
      tecnologia: "Transferência térmica",
      conectividade: "USB",
      paginas_impressas: 2407,
    };
    mockBuscarVerificacao.mockResolvedValue({
      ...verificacaoBase,
      diagnostico: "Revisão geral e calibração dos sensores.",
    });

    await PdfService.gerarOrdemServico(equipamento);

    const documento = JSON.stringify(mockAutoTable.mock.calls);
    for (const rotulo of [
      "STATUS ATUAL",
      "CLIENTE",
      "EQUIPAMENTO",
      "ESPECIFICAÇÕES",
      "DEFEITO INFORMADO",
      "LAUDO TÉCNICO",
      "ACESSÓRIOS",
      "OBSERVAÇÕES",
      "cliente@example.com",
      "Transferência térmica",
      "Revisão geral e calibração dos sensores.",
    ]) {
      expect(documento).toContain(rotulo);
    }
    expect(documento).not.toMatch(/prioridade|forma de pagamento/i);
  });
});
