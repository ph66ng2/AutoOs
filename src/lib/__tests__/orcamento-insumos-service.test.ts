import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrcamentoInsumosDetalhe } from "@/types";

const mocks = vi.hoisted(() => ({
  enviarEmail: vi.fn(),
  enviarWhatsapp: vi.fn(),
  construir: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { enviarEmail: mocks.enviarEmail, enviarWhatsapp: mocks.enviarWhatsapp },
}));
vi.mock("@/lib/pdf-service", () => ({
  PdfService: { construirOrcamentoInsumos: mocks.construir },
}));

import { OrcamentoInsumosService } from "@/lib/orcamento-insumos-service";

function orcamento(sobrescrever: Partial<OrcamentoInsumosDetalhe> = {}): OrcamentoInsumosDetalhe {
  return {
    id: 7,
    empresa_id: 1,
    numero: 12,
    numero_exibicao: "OI-12",
    cliente_id: 3,
    cliente_nome: "Gráfica Alfa",
    cliente_email: "contato@alfa.test",
    cliente_telefone: "(71) 99999-0000",
    contato_id: null,
    status: "RASCUNHO",
    validade: "2026-11-01",
    desconto: 0,
    valor_subtotal: 100,
    valor_total: 100,
    criado_em: "2026-10-20 14:03:05+00",
    atualizado_em: "2026-10-20 14:03:05+00",
    total_itens: 1,
    itens: [
      { id: 1, orcamento_id: 7, produto_id: 10, descricao: "Etiqueta 100x50", categoria: "ETIQUETA", quantidade: 4, valor_unitario: 25, valor_total: 100 },
    ],
    ...sobrescrever,
  };
}

const pdf = { filename: "Orcamento_Insumos_OI-12.pdf", bytes: new Uint8Array([1, 2, 3]), mimeType: "application/pdf" as const };

describe("OrcamentoInsumosService.enviarEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.construir.mockResolvedValue(pdf);
    mocks.enviarEmail.mockResolvedValue(undefined);
  });

  it("envia o PDF em anexo com assunto e texto próprios do orçamento de insumos", async () => {
    const resultado = await OrcamentoInsumosService.enviarEmail(orcamento());
    expect(resultado).toEqual({ sucesso: true });
    const pedido = mocks.enviarEmail.mock.calls[0][0];
    expect(pedido.email).toBe("contato@alfa.test");
    expect(pedido.destinatario).toBe("Gráfica Alfa");
    expect(pedido.assunto).toBe("Orçamento de insumos OI-12 - BMI TAG");
    expect(pedido.corpo_texto).toContain("Segue o orçamento de insumos OI-12.");
    expect(pedido.cc).toEqual(["medeiros@bmitag.com.br"]);
    expect(pedido.anexos).toEqual([{ filename: pdf.filename, content_type: "application/pdf", bytes: [1, 2, 3] }]);
  });

  it("prefere o e-mail do contato escolhido", async () => {
    await OrcamentoInsumosService.enviarEmail(orcamento({ contato_id: 4, contato_nome: "Maria", contato_email: "maria@alfa.test" }));
    expect(mocks.enviarEmail.mock.calls[0][0].email).toBe("maria@alfa.test");
    expect(mocks.enviarEmail.mock.calls[0][0].destinatario).toBe("Maria");
  });

  it("não tenta enviar sem e-mail cadastrado", async () => {
    const resultado = await OrcamentoInsumosService.enviarEmail(orcamento({ cliente_email: null }));
    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toMatch(/e-mail/i);
    expect(mocks.enviarEmail).not.toHaveBeenCalled();
  });

  it("devolve o erro do SMTP sem lançar", async () => {
    mocks.enviarEmail.mockRejectedValue("SMTP não configurado");
    expect(await OrcamentoInsumosService.enviarEmail(orcamento())).toEqual({ sucesso: false, erro: "SMTP não configurado" });
  });

  it("reaproveita o PDF já gerado", async () => {
    await OrcamentoInsumosService.enviarEmail(orcamento(), pdf);
    expect(mocks.construir).not.toHaveBeenCalled();
  });
});

describe("OrcamentoInsumosService.enviarWhatsapp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enviarWhatsapp.mockResolvedValue(undefined);
  });

  it("envia o texto do orçamento ao telefone com DDI 55", async () => {
    const resultado = await OrcamentoInsumosService.enviarWhatsapp(orcamento());
    expect(resultado).toEqual({ sucesso: true });
    const [telefone, mensagem] = mocks.enviarWhatsapp.mock.calls[0];
    expect(telefone).toBe("5571999990000");
    expect(mensagem).toContain("orçamento de insumos OI-12");
    expect(mensagem).toContain("- 4x Etiqueta 100x50");
  });

  it("não tenta enviar sem telefone", async () => {
    const resultado = await OrcamentoInsumosService.enviarWhatsapp(orcamento({ cliente_telefone: null }));
    expect(resultado.sucesso).toBe(false);
    expect(mocks.enviarWhatsapp).not.toHaveBeenCalled();
  });

  it("recusa telefone curto demais", async () => {
    const resultado = await OrcamentoInsumosService.enviarWhatsapp(orcamento({ cliente_telefone: "1234" }));
    expect(resultado.sucesso).toBe(false);
    expect(resultado.erro).toMatch(/inválido/i);
  });

  it("devolve a falha da API", async () => {
    mocks.enviarWhatsapp.mockRejectedValue(new Error("API fora do ar"));
    expect(await OrcamentoInsumosService.enviarWhatsapp(orcamento())).toEqual({ sucesso: false, erro: "API fora do ar" });
  });
});
