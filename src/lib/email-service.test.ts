import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Equipamento, Verificacao } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockRegistrarComunicacao = vi.hoisted(() => vi.fn());
const mockGerarOrcamento = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    registrarComunicacao: (...args: unknown[]) => mockRegistrarComunicacao(...args),
  },
}));

vi.mock("@/lib/pdf-service", () => ({
  PdfService: {
    gerarOrcamento: (...args: unknown[]) => mockGerarOrcamento(...args),
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
    expect(args.input.anexos?.[0]?.filename).toBe("orcamento_test.pdf");

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
  });

  it("enviarEquipamentoPronto envia e registra sucesso", async () => {
    const res = await EmailService.enviarEquipamentoPronto({
      ...equipamentoBase,
      valor_orcamento: 99.5,
    });

    expect(res).toEqual({ sucesso: true });
    expect(mockInvoke).toHaveBeenCalledWith(
      "enviar_email",
      expect.objectContaining({
        input: expect.objectContaining({
          email: "fulano@example.com",
          corpo: expect.stringContaining("pronto para retirada"),
        }),
      }),
    );
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
