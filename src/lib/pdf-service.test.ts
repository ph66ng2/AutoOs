import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Equipamento, Verificacao } from "@/types";

const mockPublicar = vi.hoisted(() => vi.fn());
const mockDecisao = vi.hoisted(() => vi.fn());
const mockInvoke = vi.hoisted(() => vi.fn());
const mockListarImagens = vi.hoisted(() => vi.fn());
const mockListarHistorico = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    publicarDocumentoPortal: (...args: unknown[]) => mockPublicar(...args),
    obterVersaoDocumentoPortal: (...args: unknown[]) => mockDecisao(...args),
    listarImagensEquipamento: (...args: unknown[]) => mockListarImagens(...args),
    listarHistoricoEquipamento: (...args: unknown[]) => mockListarHistorico(...args),
    buscarVerificacao: vi.fn().mockResolvedValue(null),
  },
}));

import { PdfService } from "@/lib/pdf-service";

const equipamento: Equipamento = {
  id: 501,
  serial_number: "SN-PDF-1",
  marca: "HP",
  modelo: "M404dn",
  tipo: "LASER",
  status: "AGUARDANDO_APROVACAO",
  data_entrada: "2026-05-06",
  cliente_nome: "Empresa Alfa",
};

const verificacao: Verificacao = {
  equipamento_id: 501,
  tecnico_nome: "João",
  problema_relatado: "Ruído",
  diagnostico: "Toner e rolete revisados.",
  servicos_necessarios: JSON.stringify([
    { descricao: "Limpeza laser", valor: 40 },
  ]),
  pecas_necessarias: JSON.stringify([
    { nome: "Rolo papel", quantidade: 1, valorUnitario: 25, valorTotal: 25 },
  ]),
  custo_estimado_mao_obra: 40,
  custo_estimado_pecas: 25,
  custo_total: 65,
  tempo_estimado: 2,
};

describe("PdfService — orçamento/OS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListarImagens.mockResolvedValue([]);
    mockListarHistorico.mockResolvedValue([]);
    mockInvoke.mockResolvedValue("/fake/temp/Orcamento_SN-PDF-1_test.pdf");
  });

  it("gera PDF, persiste bytes via salvar_orcamento_pdf e devolve caminho", async () => {
    const path = await PdfService.gerarOrcamento(equipamento, verificacao);

    expect(path).toBe("/fake/temp/Orcamento_SN-PDF-1_test.pdf");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [command, args] = mockInvoke.mock.calls[0]!;
    expect(command).toBe("salvar_orcamento_pdf");
    expect(args.empresaNome).toBe("Empresa Alfa");
    expect(Array.isArray(args.bytes)).toBe(true);
    expect(args.bytes.length).toBeGreaterThan(1000);

    expect(mockListarImagens).toHaveBeenCalledWith(501);
  });

  it("gera PDF de ordem de serviço e devolve caminho", async () => {
    mockInvoke.mockResolvedValueOnce("/fake/temp/OrdemServico_SN-PDF-1_test.pdf");

    const path = await PdfService.gerarOrdemServico(equipamento);

    expect(path).toBe("/fake/temp/OrdemServico_SN-PDF-1_test.pdf");
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [command, args] = mockInvoke.mock.calls[0]!;
    expect(command).toBe("salvar_ordem_servico_pdf");
    expect(args.empresaNome).toBe("Empresa Alfa");
    expect(Array.isArray(args.bytes)).toBe(true);
    expect(args.bytes.length).toBeGreaterThan(500);
  });

  it("constrói a ordem em memória para prévia sem persistir", async () => {
    const artifact = await PdfService.construirOrdemServico(equipamento, "entrada-501.pdf");

    expect(artifact.filename).toBe("entrada-501.pdf");
    expect(artifact.mimeType).toBe("application/pdf");
    expect(artifact.bytes.byteLength).toBeGreaterThan(500);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("constrói orçamento e relatório em memória para prévia sem persistir", async () => {
    const [orcamento, relatorio] = await Promise.all([
      PdfService.construirOrcamento(equipamento, verificacao),
      PdfService.construirRelatorioStatus(equipamento),
    ]);

    expect(orcamento.bytes.byteLength).toBeGreaterThan(1_000);
    expect(relatorio.bytes.byteLength).toBeGreaterThan(500);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("usa no PDF o valor atualizado durante a manutenção", async () => {
    const equipamentoEmManutencao: Equipamento = {
      ...equipamento,
      status: "EM_MANUTENCAO",
      valor_orcamento: 275,
    };
    const verificacaoAtualizada: Verificacao = {
      ...verificacao,
      servicos_necessarios: JSON.stringify([
        { descricao: "Manutenção ajustada", valor: 275 },
      ]),
      pecas_necessarias: JSON.stringify([]),
      custo_total: 275,
      adjusted_at: "2026-09-08T11:45:00-03:00",
    };

    const artifact = await PdfService.construirOrcamento(
      equipamentoEmManutencao,
      verificacaoAtualizada,
    );
    const pdfSource = new TextDecoder("latin1").decode(artifact.bytes);

    expect(pdfSource).toContain("(VALOR TOTAL:) Tj");
    expect(pdfSource).toMatch(/\(R\$\s+275,00\) Tj/);
  });

  it("não imprime PLANILHA DE VALORES nem o título antigo da descrição", async () => {
    const artifact = await PdfService.construirOrcamento(equipamento, {
      ...verificacao,
      observacoes: "Botão feed ficando desgastado",
    });
    const pdfSource = new TextDecoder("latin1").decode(artifact.bytes);
    expect(pdfSource).not.toContain("PLANILHA DE VALORES");
    expect(pdfSource).not.toContain("DESCRIÇÃO DO SERVIÇO TÉCNICO");
  });

  it("imprime o prazo de execução informado na prévia", async () => {
    const padrao = await PdfService.construirOrcamento(equipamento, verificacao);
    const customizado = await PdfService.construirOrcamento(
      equipamento,
      verificacao,
      undefined,
      { minDiasUteis: 5, maxDiasUteis: 10 },
    );
    const pdfPadrao = new TextDecoder("latin1").decode(padrao.bytes);
    const pdfCustomizado = new TextDecoder("latin1").decode(customizado.bytes);
    expect(pdfPadrao).toMatch(/02 a 04 dias/);
    expect(pdfCustomizado).toMatch(/05 a 10 dias/);
    expect(pdfCustomizado).not.toMatch(/02 a 04 dias/);
  });
});

describe("PDF oficial no portal", () => {
  const comToken = { ...equipamento, atualizado_em: "2026-11-10T12:00:00.123Z" };
  beforeEach(() => {
    vi.clearAllMocks();
    mockListarImagens.mockResolvedValue([]);
    mockListarHistorico.mockResolvedValue([]);
    mockInvoke.mockResolvedValue("/tmp/oficial.pdf");
    mockDecisao.mockResolvedValue({ versaoId: 91, versao: 1 });
    mockPublicar.mockImplementation((_id, bytes) => Promise.resolve(Array.from(bytes)));
  });

  it("envia ao Storage os mesmos bytes da ficha de recebimento salva pelo balcão", async () => {
    const artifact = await PdfService.construirOrdemServico(comToken);
    await PdfService.salvarOrdemServico(artifact, comToken);
    expect(mockPublicar).toHaveBeenCalledTimes(1);
    const [id, bytes, ref] = mockPublicar.mock.calls[0];
    expect(id).toBe(501);
    expect(ref).toEqual({ tipo: "ORDEM_SERVICO", versaoId: null, atualizadoEm: comToken.atualizado_em });
    expect(Array.from(bytes)).toEqual(mockInvoke.mock.calls[0][1].bytes);
  });

  it.each([91, 92])("congela a versão %s antes de gerar e salva os bytes que publica", async (versaoId) => {
    mockDecisao.mockResolvedValue({ versaoId });
    await PdfService.gerarOrcamento(comToken, verificacao);
    expect(mockPublicar.mock.calls[0][2]).toMatchObject({ tipo: "ORCAMENTO", versaoId });
    expect(Array.from(mockPublicar.mock.calls[0][1])).toEqual(mockInvoke.mock.calls[0][1].bytes);
  });

  it("reutiliza o arquivo canônico quando outro computador publicou antes", async () => {
    const canonico = [37, 80, 68, 70, 45, 99];
    mockPublicar.mockResolvedValue(canonico);
    await PdfService.gerarOrcamento(comToken, verificacao);
    expect(mockInvoke.mock.calls[0][1].bytes).toEqual(canonico);
  });

  it("upload falho não impede emissão; salvar faz nova tentativa com os mesmos bytes", async () => {
    mockPublicar.mockRejectedValueOnce(new Error("storage offline"));
    const artifact = await PdfService.construirOrdemServico(comToken);
    await expect(PdfService.salvarOrdemServico(artifact, comToken)).resolves.toBe("/tmp/oficial.pdf");
    expect(mockPublicar).toHaveBeenCalledTimes(2);
    expect(mockPublicar.mock.calls[0][1]).toEqual(mockPublicar.mock.calls[1][1]);
    expect(Array.from(mockPublicar.mock.calls[1][1])).toEqual(mockInvoke.mock.calls[0][1].bytes);
  });

  it("orçamento ajustado usa referência própria e os mesmos bytes salvos", async () => {
    const artifact = await PdfService.construirOrcamentoAjustado(comToken, { ...verificacao, adjusted_at: "2026-11-10T10:00:00Z" });
    expect(artifact).not.toBeNull();
    await PdfService.salvarOrcamento(artifact!, comToken);
    expect(mockPublicar.mock.calls[0][2]).toMatchObject({ tipo: "ORCAMENTO_AJUSTADO", versaoId: 91 });
    expect(Array.from(mockPublicar.mock.calls[0][1])).toEqual(mockInvoke.mock.calls[0][1].bytes);
  });

  it("sem versão publicada não associa orçamento antigo à versão de outro atendimento", async () => {
    mockDecisao.mockResolvedValue(null);
    await PdfService.gerarOrcamento(comToken, verificacao);
    expect(mockPublicar).not.toHaveBeenCalled();
    expect(mockInvoke).toHaveBeenCalled();
  });
});
