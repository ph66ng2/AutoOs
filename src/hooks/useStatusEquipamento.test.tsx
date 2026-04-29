import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStatusEquipamento } from "@/hooks/useStatusEquipamento";
import type { Equipamento, Verificacao } from "@/types";

vi.mock("@/lib/db", () => ({
  db: {
    salvarVerificacao: vi.fn(),
    atualizarStatusEquipamento: vi.fn(),
    buscarEquipamento: vi.fn(),
    buscarVerificacao: vi.fn(),
  },
}));

vi.mock("@/lib/email-service", () => ({
  EmailService: {
    enviarOrcamento: vi.fn(),
    enviarEquipamentoPronto: vi.fn(),
  },
}));

vi.mock("@/lib/whatsapp-service", () => ({
  WhatsAppService: {
    enviarOrcamento: vi.fn(),
    enviarEquipamentoPronto: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { EmailService } from "@/lib/email-service";
import { WhatsAppService } from "@/lib/whatsapp-service";

const equipamentoBase: Equipamento = {
  id: 10,
  serial_number: "SN-001",
  marca: "HP",
  modelo: "M404",
  tipo: "LASER",
  status: "EM_VERIFICACAO",
  data_entrada: "2026-04-01",
  cliente_nome: "Cliente Teste",
  cliente_email: "cliente@teste.com",
  cliente_telefone: "11999999999",
  atualizado_em: "2026-04-28 12:00:00",
};

const verificacaoBase: Verificacao = {
  id: 99,
  equipamento_id: 10,
  tecnico_nome: "Tecnico A",
  problema_relatado: "Nao imprime",
  diagnostico: "Troca de rolete",
  itens_verificados: "[]",
  servicos_necessarios: "[]",
  pecas_necessarias: "[]",
  custo_estimado_mao_obra: 50,
  custo_estimado_pecas: 30,
  custo_total: 80,
  tempo_estimado: 2,
  concluida: true,
  observacoes: "",
};

describe("useStatusEquipamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finaliza verificacao e envia comunicacoes de orcamento", async () => {
    vi.mocked(db.salvarVerificacao).mockResolvedValue(1);
    vi.mocked(db.atualizarStatusEquipamento).mockResolvedValue();
    vi.mocked(db.buscarEquipamento)
      .mockResolvedValueOnce({
        ...equipamentoBase,
        status: "VERIFICADO",
        atualizado_em: "2026-04-28 12:00:01",
      })
      .mockResolvedValueOnce({
        ...equipamentoBase,
        status: "AGUARDANDO_APROVACAO",
        valor_orcamento: 80,
        atualizado_em: "2026-04-28 12:00:02",
      });
    vi.mocked(db.buscarVerificacao).mockResolvedValue(verificacaoBase);
    vi.mocked(WhatsAppService.enviarOrcamento).mockResolvedValue({ sucesso: true });
    vi.mocked(EmailService.enviarOrcamento).mockResolvedValue({ sucesso: true });

    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.finalizarVerificacao>> | undefined;

    await act(async () => {
      resposta = await result.current.finalizarVerificacao(equipamentoBase, {
        ...verificacaoBase,
      });
    });

    expect(resposta).toEqual({
      sucesso: true,
      email: { sucesso: true },
      whatsapp: { sucesso: true },
    });
    expect(db.atualizarStatusEquipamento).toHaveBeenNthCalledWith(
      1,
      10,
      "VERIFICADO",
      undefined,
      undefined,
      undefined,
      equipamentoBase.atualizado_em,
    );
    expect(db.atualizarStatusEquipamento).toHaveBeenNthCalledWith(
      2,
      10,
      "AGUARDANDO_APROVACAO",
      80,
      expect.any(String),
      undefined,
      "2026-04-28 12:00:01",
    );
  });

  it("marca como pronto e retorna erro de canal sem quebrar fluxo", async () => {
    vi.mocked(db.atualizarStatusEquipamento).mockResolvedValue();
    vi.mocked(db.buscarEquipamento).mockResolvedValue({
      ...equipamentoBase,
      status: "PRONTO",
    });
    vi.mocked(WhatsAppService.enviarEquipamentoPronto).mockResolvedValue({ sucesso: true });
    vi.mocked(EmailService.enviarEquipamentoPronto).mockRejectedValue(new Error("SMTP indisponivel"));

    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.marcarComoPronto>> | undefined;

    await act(async () => {
      resposta = await result.current.marcarComoPronto(equipamentoBase);
    });

    expect(resposta?.sucesso).toBe(true);
    expect(resposta?.whatsapp).toEqual({ sucesso: true });
    expect(resposta?.email).toEqual({ sucesso: false, erro: "SMTP indisponivel" });
    expect(db.atualizarStatusEquipamento).toHaveBeenCalledWith(
      10,
      "PRONTO",
      undefined,
      undefined,
      undefined,
      equipamentoBase.atualizado_em,
    );
  });

  it("retorna falha quando atualizacao de status quebra", async () => {
    vi.mocked(db.atualizarStatusEquipamento).mockRejectedValue(new Error("Falha no backend"));

    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.marcarComoPronto>> | undefined;

    await act(async () => {
      resposta = await result.current.marcarComoPronto(equipamentoBase);
    });

    expect(resposta).toEqual({ sucesso: false, erro: "Falha no backend" });
  });
});