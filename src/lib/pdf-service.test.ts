import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Equipamento, Verificacao } from "@/types";

/** svgToPng usa `Image` + canvas; stubs evitam travamento sob jsdom. */
class MockImageForPdf {
  onload?: (ev: unknown) => void;
  #src = "";
  get src() {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => this.onload?.({}));
  }
}
vi.stubGlobal("Image", MockImageForPdf as unknown as typeof Image);

const tinyPng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const canvasProto = HTMLCanvasElement.prototype;
const origGetContext = canvasProto.getContext.bind(canvasProto);
vi.spyOn(canvasProto, "getContext").mockImplementation(function (
  contextId: string,
  ...rest: unknown[]
) {
  if (contextId === "2d") {
    return {
      drawImage: vi.fn(),
      scale: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
  }
  return origGetContext(contextId as "2d", ...(rest as never[]));
});
vi.spyOn(canvasProto, "toDataURL").mockReturnValue(tinyPng);

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListarImagens = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    listarImagensEquipamento: (...args: unknown[]) => mockListarImagens(...args),
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
});
