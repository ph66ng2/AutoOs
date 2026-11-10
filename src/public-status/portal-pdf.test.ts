import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetalheAtendimento } from "./portal-api";
import { formatarDocumento, gerarPdf, modeloComprovanteEntrega } from "./portal-pdf";

const doc = vi.hoisted(() => ({
  internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  setFont: vi.fn(), setFontSize: vi.fn(), setTextColor: vi.fn(), setDrawColor: vi.fn(),
  text: vi.fn(), line: vi.fn(), addPage: vi.fn(), save: vi.fn(),
  splitTextToSize: vi.fn((t: string) => [t]),
}));
vi.mock("jspdf", () => ({ jsPDF: class { constructor() { return doc; } } }));

function detalhe(extra: Partial<DetalheAtendimento> = {}): DetalheAtendimento {
  return {
    id: 28, equipamento: "Zebra ZT230", serie: "SER-1", patrimonio: null, status: "APROVADO", titulo: "Orçamento aprovado", orientacao: "",
    statusAlteradoEm: "2026-10-14T12:00:00Z", entradaEm: "2026-10-10T12:00:00Z",
    cliente: { nome: "Cliente A", documento: "11222333000181", exigeOrdemCompra: true },
    defeitoRelatado: "Não imprime", valores: { orcamento: 350, final: null, atual: 350 }, etapas: [], fotos: [], historico: [],
    orcamento: {
      versaoId: 9, versao: 2, publicadaEm: "2026-10-14T12:00:00Z", valorTotal: 350, validoAte: "2026-10-30T03:00:00Z", estado: "ENCERRADA",
      servicos: [{ descricao: "Troca do fusor", valor: 250, pecas: [{ nome: "Fusor", quantidade: 1, valorUnitario: 100 }] }],
      pecas: [], janelaMinutos: 15, aceiteOnline: true,
      resposta: { id: 1, decisao: "APROVAR", origem: "PORTAL_CLIENTE", registradaEm: "2026-10-15T12:00:00Z", janelaAte: "2026-10-15T12:15:00Z", contato: "Ana", propria: true, estado: "EFETIVADA", efetivadaEm: null, protocolo: "R-1", ordemCompra: "OC-9" },
    },
    solicitacoes: [], contatoEmpresa: null, podeDecidir: true, verificacaoRecente: true, contato: "Ana", temTelefone: true, temEmail: true,
    ...extra,
  };
}

const texto = (m: ReturnType<typeof modeloComprovanteEntrega>) => JSON.stringify(m?.blocos);

beforeEach(() => vi.clearAllMocks());

it("formata o documento do cliente no comprovante", () => {
  expect(formatarDocumento("12345678909")).toBe("123.456.789-09");
  expect(formatarDocumento(null)).toBeNull();
});

describe("comprovante de entrega", () => {
  it("só existe quando entregue e traz o valor final", () => {
    expect(modeloComprovanteEntrega(detalhe())).toBeNull();
    const m = modeloComprovanteEntrega(detalhe({ status: "ENTREGUE", valores: { orcamento: 350, final: 420, atual: 420 }, etapas: [{ status: "ENTREGUE", em: "2026-10-20T12:00:00Z" }] }));
    const t = texto(m);
    expect(t).toContain("Valor final");
    expect(t).toMatch(/420,00/);
    expect(t).toMatch(/Valor orçado: R\$.*350,00/);
    expect(t).toContain("Entregue em");
  });
});

describe("gerarPdf", () => {
  it("carrega o jspdf sob demanda e salva o arquivo", async () => {
    const m = modeloComprovanteEntrega(detalhe({ status: "ENTREGUE" }))!;
    await gerarPdf(m);
    expect(doc.save).toHaveBeenCalledWith("comprovante-entrega-28.pdf");
    expect(doc.text).toHaveBeenCalled();
  });
});
