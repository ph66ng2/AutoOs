import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Equipamento, Verificacao } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockRegistrarComunicacao = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    registrarComunicacao: (...args: unknown[]) => mockRegistrarComunicacao(...args),
  },
}));

import { WhatsAppService } from "@/lib/whatsapp-service";

const equipamentoBase: Equipamento = {
  id: 20,
  serial_number: "SN-W",
  marca: "Epson",
  modelo: "L3250",
  tipo: "JATO",
  status: "AGUARDANDO_APROVACAO",
  data_entrada: "2026-05-02",
  cliente_nome: "Beltrano",
  cliente_telefone: "11988776655",
};

const verificacaoBase: Verificacao = {
  equipamento_id: 20,
  tecnico_nome: "Tech",
  problema_relatado: "p",
  diagnostico: "d",
  itens_verificados: "[]",
  servicos_necessarios: "[]",
  pecas_necessarias: "[]",
  custo_estimado_mao_obra: 5,
  custo_estimado_pecas: 5,
  custo_total: 10,
  tempo_estimado: 2,
  concluida: true,
  observacoes: "",
};

describe("WhatsAppService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it("enviarOrcamento retorna erro sem telefone", async () => {
    const res = await WhatsAppService.enviarOrcamento(
      { ...equipamentoBase, cliente_telefone: undefined },
      verificacaoBase,
    );
    expect(res).toEqual({ sucesso: false, erro: "Cliente não possui telefone cadastrado" });
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("enviarOrcamento normaliza DDI 55 e chama enviar_whatsapp", async () => {
    const res = await WhatsAppService.enviarOrcamento(equipamentoBase, verificacaoBase);

    expect(res).toEqual({ sucesso: true });
    expect(mockInvoke).toHaveBeenCalledWith(
      "enviar_whatsapp",
      expect.objectContaining({
        input: {
          contato: "5511988776655",
          mensagem: expect.stringContaining("Beltrano"),
        },
      }),
    );
    expect(mockInvoke.mock.calls[0]![1].input.mensagem).toContain("SN-W");
    expect(mockInvoke.mock.calls[0]![1].input.mensagem).toContain("R$ 10.00");

    expect(mockRegistrarComunicacao).toHaveBeenCalledWith(
      expect.objectContaining({
        equipamento_id: 20,
        tipo: "ORCAMENTO",
        canal: "WHATSAPP",
        contato: "5511988776655",
        enviado: true,
      }),
    );
  });

  it("enviarOrcamento mantém 55 quando já presente no número", async () => {
    await WhatsAppService.enviarOrcamento(
      { ...equipamentoBase, cliente_telefone: "+55 (11) 98877-6655" },
      verificacaoBase,
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      "enviar_whatsapp",
      expect.objectContaining({
        input: expect.objectContaining({ contato: "5511988776655" }),
      }),
    );
  });

  it("enviarOrcamento registra falha quando telefone é curto demais", async () => {
    const res = await WhatsAppService.enviarOrcamento(
      { ...equipamentoBase, cliente_telefone: "11" },
      verificacaoBase,
    );
    expect(res.sucesso).toBe(false);
    expect(res.erro).toContain("Telefone");
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockRegistrarComunicacao).toHaveBeenCalledWith(
      expect.objectContaining({
        enviado: false,
        canal: "WHATSAPP",
      }),
    );
  });

  it("enviarOrcamento registra falha quando API rejeita", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("HTTP 500"));

    const res = await WhatsAppService.enviarOrcamento(equipamentoBase, verificacaoBase);

    expect(res).toEqual({ sucesso: false, erro: "HTTP 500" });
    expect(mockRegistrarComunicacao).toHaveBeenCalledWith(
      expect.objectContaining({
        enviado: false,
        erro: "HTTP 500",
      }),
    );
  });

  it("enviarEquipamentoPronto envia mensagem de pronto e registra sucesso", async () => {
    const res = await WhatsAppService.enviarEquipamentoPronto({
      ...equipamentoBase,
      valor_final: 120,
    });

    expect(res).toEqual({ sucesso: true });
    expect(mockInvoke).toHaveBeenCalledWith(
      "enviar_whatsapp",
      expect.objectContaining({
        input: {
          contato: "5511988776655",
          mensagem: expect.stringContaining("PRONTO"),
        },
      }),
    );
    expect(mockInvoke.mock.calls[0]![1].input.mensagem).toContain("120.00");
    expect(mockRegistrarComunicacao).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: "PRONTO",
        canal: "WHATSAPP",
        enviado: true,
      }),
    );
  });
});
