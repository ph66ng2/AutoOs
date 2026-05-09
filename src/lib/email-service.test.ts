import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Equipamento, Verificacao } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockRegistrarComunicacao = vi.hoisted(() => vi.fn());
const mockGerarOrcamento = vi.hoisted(() => vi.fn());
const mockGerarOrdemServico = vi.hoisted(() => vi.fn());
const mockBuscarVerificacao = vi.hoisted(() => vi.fn());
const mockCopiarAnexoEmailParaTemp = vi.hoisted(() => vi.fn());
const mockRemoverAnexoEmailTemp = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    registrarComunicacao: (...args: unknown[]) => mockRegistrarComunicacao(...args),
    buscarVerificacao: (...args: unknown[]) => mockBuscarVerificacao(...args),
    copiarAnexoEmailParaTemp: (...args: unknown[]) => mockCopiarAnexoEmailParaTemp(...args),
    removerAnexoEmailTemp: (...args: unknown[]) => mockRemoverAnexoEmailTemp(...args),
  },
}));

vi.mock("@/lib/pdf-service", () => ({
  PdfService: {
    gerarOrcamento: (...args: unknown[]) => mockGerarOrcamento(...args),
    gerarOrdemServico: (...args: unknown[]) => mockGerarOrdemServico(...args),
  },
}));

import { EmailService } from "@/lib/email-service";

const equipamentoBase: Equipamento = {
  id: 10,
  serial_number: "SN-E",
  marca: "HP",
  modelo: "M404",
  tipo: "LASER",
  status: "AGUARDANDO_APROVACAO",
  data_entrada: "2026-05-01",
  cliente_nome: "Fulano",
  cliente_email: "fulano@example.com",
};

const verificacaoBase: Verificacao = {
  equipamento_id: 10,
  tecnico_nome: "Tech",
  problema_relatado: "p",
  diagnostico: "d",
  itens_verificados: "[]",
  servicos_necessarios: "[]",
  pecas_necessarias: "[]",
  custo_estimado_mao_obra: 10,
  custo_estimado_pecas: 20,
  custo_total: 30,
  tempo_estimado: 1,
  concluida: true,
  observacoes: "",
};

describe("EmailService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGerarOrcamento.mockResolvedValue("/fake/path/orcamento_test.pdf");
    mockGerarOrdemServico.mockResolvedValue("/fake/path/ordem_test.pdf");
    mockBuscarVerificacao.mockResolvedValue(verificacaoBase);
    mockCopiarAnexoEmailParaTemp.mockResolvedValue("/tmp/autoos/orcamento_test.pdf");
    mockRemoverAnexoEmailTemp.mockResolvedValue(undefined);
    mockInvoke.mockResolvedValue(undefined);
  });

  it("enviarOrcamento retorna erro quando não há email do cliente", async () => {
    const res = await EmailService.enviarOrcamento({ ...equipamentoBase, cliente_email: undefined }, verificacaoBase);
    expect(res).toEqual({ sucesso: false, erro: "Cliente não possui email cadastrado" });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockRegistrarComunicacao).not.toHaveBeenCalled();
  });

  it("enviarOrcamento chama enviar_email com assunto/corpo e registra comunicação enviada", async () => {
    const res = await EmailService.enviarOrcamento(equipamentoBase, verificacaoBase);

    expect(res).toEqual({ sucesso: true });
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [cmd, args] = mockInvoke.mock.calls[0]!;
    expect(cmd).toBe("enviar_email");
    expect(args.input.destinatario).toBe("Fulano");
    expect(args.input.email).toBe("fulano@example.com");
    expect(args.input.assunto).toContain("Orçamento");
    expect(args.input.assunto).toContain("SN-E");
    expect(args.input.corpo).toContain("Fulano");
    expect(args.input.corpo_html).toContain('Marca/Modelo');
    expect(args.input.corpo_html).toContain('Serial Number');
    expect(args.input.corpo).toContain("SERVIÇOS");
    expect(args.input.corpo).toContain("TOTAL");
    expect(args.input.corpo_html).toContain("Serviços");
    expect(args.input.corpo_html).toContain("Total");
    // Garante que campos legados (não existem mais no formulário) não voltem
    expect(args.input.corpo).not.toMatch(/Mão de Obra/i);
    expect(args.input.corpo).not.toMatch(/Peças:/);
    expect(args.input.corpo).not.toMatch(/Tempo Estimado/i);
    expect(args.input.corpo_html).not.toMatch(/Mão de obra/i);
    expect(args.input.corpo_html).not.toMatch(/>Peças</);
    expect(args.input.corpo_html).not.toMatch(/Tempo estimado/i);
    // Avisos novos (CC gerência, troca de peças, contato do técnico)
    expect(args.input.cc).toContain("medeiros@bmitag.com.br");
    expect(args.input.corpo).toContain("troca de peças");
    expect(args.input.corpo_html).toContain("troca de peças");
    expect(args.input.corpo).toContain("equipe técnica");
    expect(args.input.corpo_html).toContain("equipe técnica");
    expect(args.input.anexos?.[0]?.filename).toBe("orcamento_test.pdf");
    expect(args.input.anexos?.[0]?.path).toBe("/tmp/autoos/orcamento_test.pdf");

    expect(mockCopiarAnexoEmailParaTemp).toHaveBeenCalledWith(
      "/fake/path/orcamento_test.pdf",
      "orcamento_test.pdf",
    );
    expect(mockRemoverAnexoEmailTemp).toHaveBeenCalledWith("/tmp/autoos/orcamento_test.pdf");

    expect(mockRegistrarComunicacao).toHaveBeenCalledWith(
      expect.objectContaining({
        equipamento_id: 10,
        tipo: "ORCAMENTO",
        canal: "EMAIL",
        enviado: true,
        erro: undefined,
      }),
    );
    expect(mockGerarOrcamento).toHaveBeenCalledWith(equipamentoBase, verificacaoBase);
  });

  it("enviarOrcamento adiciona Ivan em cópia quando ele é o técnico responsável (junto da gerência)", async () => {
    await EmailService.enviarOrcamento(equipamentoBase, {
      ...verificacaoBase,
      tecnico_nome: "Ivan",
    });

    const [, args] = mockInvoke.mock.calls[0]!;
    expect(args.input.cc).toEqual(["medeiros@bmitag.com.br", "ivan@bmicode.com"]);
    // Frase orienta o cliente a falar diretamente com o técnico
    expect(args.input.corpo).toContain("ivan@bmicode.com");
    expect(args.input.corpo_html).toContain("ivan@bmicode.com");
  });

  it("enviarOrcamento adiciona Isaías em cópia mesmo quando o nome tem acento", async () => {
    await EmailService.enviarOrcamento(equipamentoBase, {
      ...verificacaoBase,
      tecnico_nome: "Isaías",
    });

    const [, args] = mockInvoke.mock.calls[0]!;
    expect(args.input.cc).toEqual(["medeiros@bmitag.com.br", "isaias@bmicode.com"]);
    expect(args.input.corpo).toContain("isaias@bmicode.com");
  });

  it("enviarOrcamento sempre coloca a gerência em cópia mesmo sem técnico identificado", async () => {
    await EmailService.enviarOrcamento(equipamentoBase, {
      ...verificacaoBase,
      tecnico_nome: "Outro",
    });

    const [, args] = mockInvoke.mock.calls[0]!;
    expect(args.input.cc).toEqual(["medeiros@bmitag.com.br"]);
    // Sem email do técnico, fallback genérico
    expect(args.input.corpo).toContain("nossa equipe técnica");
    expect(args.input.corpo_html).toContain("nossa equipe técnica");
  });

  it("enviarOrdemEntrada adiciona o técnico inicial da OS em cópia (junto da gerência)", async () => {
    mockCopiarAnexoEmailParaTemp.mockResolvedValueOnce("/tmp/autoos/ordem_test.pdf");

    const res = await EmailService.enviarOrdemEntrada({
      ...equipamentoBase,
      status: "RECEBIDO",
      observacoes: "Técnico inicial: Ivan (ivan@bmicode.com)\nObservação do cliente",
    });

    expect(res).toEqual({ sucesso: true });
    const [cmd, args] = mockInvoke.mock.calls[0]!;
    expect(cmd).toBe("enviar_email");
    expect(args.input.cc).toEqual(["medeiros@bmitag.com.br", "ivan@bmicode.com"]);
    expect(args.input.anexos?.[0]?.path).toBe("/tmp/autoos/ordem_test.pdf");
    // Avisos novos
    expect(args.input.corpo).toContain("troca de peças");
    expect(args.input.corpo_html).toContain("troca de peças");
    expect(args.input.corpo).toContain("ivan@bmicode.com");
  });

  it("enviarOrdemEntrada adiciona Isaías em cópia quando ele é o técnico inicial", async () => {
    mockCopiarAnexoEmailParaTemp.mockResolvedValueOnce("/tmp/autoos/ordem_test.pdf");

    await EmailService.enviarOrdemEntrada({
      ...equipamentoBase,
      status: "RECEBIDO",
      observacoes: "Técnico inicial: Isaias (isaias@bmicode.com)",
    });

    const [, args] = mockInvoke.mock.calls[0]!;
    expect(args.input.cc).toEqual(["medeiros@bmitag.com.br", "isaias@bmicode.com"]);
  });

  it("enviarOrcamento registra falha quando invoke rejeita", async () => {
    mockInvoke.mockRejectedValueOnce("SMTP recusado");

    const res = await EmailService.enviarOrcamento(equipamentoBase, verificacaoBase);

    expect(res).toEqual({ sucesso: false, erro: "SMTP recusado" });
    expect(mockRegistrarComunicacao).toHaveBeenCalledWith(
      expect.objectContaining({
        enviado: false,
        erro: "SMTP recusado",
        canal: "EMAIL",
      }),
    );
    expect(mockRemoverAnexoEmailTemp).toHaveBeenCalledWith("/tmp/autoos/orcamento_test.pdf");
  });

  it("enviarEquipamentoPronto envia, registra sucesso e copia gerência", async () => {
    mockBuscarVerificacao.mockResolvedValueOnce({ ...verificacaoBase, tecnico_nome: "Ivan" });

    const res = await EmailService.enviarEquipamentoPronto({
      ...equipamentoBase,
      valor_orcamento: 99.5,
    });

    expect(res).toEqual({ sucesso: true });
    const [cmd, args] = mockInvoke.mock.calls[0]!;
    expect(cmd).toBe("enviar_email");
    expect(args.input.email).toBe("fulano@example.com");
    expect(args.input.corpo).toContain("pronto para retirada");
    expect(args.input.cc).toEqual(["medeiros@bmitag.com.br", "ivan@bmicode.com"]);
    expect(args.input.corpo).toContain("ivan@bmicode.com");
    // Não faz sentido falar de troca de peças num email de equipamento já pronto
    expect(args.input.corpo).not.toMatch(/troca de peças/i);
    expect(args.input.corpo_html).not.toMatch(/troca de peças/i);
    expect(mockRegistrarComunicacao).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "PRONTO",
        canal: "EMAIL",
        enviado: true,
      }),
    );
  });

  it("enviarEquipamentoPronto falha sem email cadastrado", async () => {
    const res = await EmailService.enviarEquipamentoPronto({ ...equipamentoBase, cliente_email: undefined });
    expect(res.sucesso).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
