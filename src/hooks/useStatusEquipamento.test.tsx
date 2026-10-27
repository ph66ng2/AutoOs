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

vi.mock("@/lib/envio-orcamento", () => ({
  enviarOrcamentoAoCliente: vi.fn(),
  calcularPrazoAprovacao: vi.fn(() => "2026-05-01"),
}));

vi.mock("@/lib/whatsapp-service", () => ({
  WhatsAppService: {
    enviarEquipamentoPronto: vi.fn(),
  },
}));

vi.mock("@/lib/email-service", () => ({
  EmailService: {
    enviarEquipamentoPronto: vi.fn(),
  },
}));

import { db } from "@/lib/db";
import { enviarOrcamentoAoCliente } from "@/lib/envio-orcamento";
import { WhatsAppService } from "@/lib/whatsapp-service";
import { EmailService } from "@/lib/email-service";

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
    vi.mocked(enviarOrcamentoAoCliente).mockResolvedValue({
      canais: { whatsapp: { enviado: true }, email: { enviado: true } },
      avisos: [],
    });
    vi.mocked(EmailService.enviarEquipamentoPronto).mockResolvedValue({ sucesso: true });
  });

  it("finaliza verificacao e envia o orcamento pela lib de envio", async () => {
    vi.mocked(db.salvarVerificacao).mockResolvedValue(1);
    vi.mocked(db.atualizarStatusEquipamento).mockResolvedValue();
    vi.mocked(db.buscarEquipamento)
      .mockResolvedValueOnce({ ...equipamentoBase, atualizado_em: "2026-04-28 12:00:00.5" })
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
    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.finalizarVerificacao>> | undefined;

    await act(async () => {
      resposta = await result.current.finalizarVerificacao(equipamentoBase, {
        ...verificacaoBase,
      });
    });

    expect(resposta).toEqual({
      sucesso: true,
      canais: {
        whatsapp: { enviado: true },
        email: { enviado: true },
      },
      avisos: [],
    });
    expect(enviarOrcamentoAoCliente).toHaveBeenCalledTimes(1);
    expect(enviarOrcamentoAoCliente).toHaveBeenCalledWith(
      expect.objectContaining({ status: "AGUARDANDO_APROVACAO", valor_orcamento: 80 }),
      verificacaoBase,
      { enviarEmail: true },
    );
    expect(db.atualizarStatusEquipamento).toHaveBeenNthCalledWith(
      1,
      10,
      "VERIFICADO",
      undefined,
      undefined,
      undefined,
      "2026-04-28 12:00:00.5",
    );
    expect(db.atualizarStatusEquipamento).toHaveBeenNthCalledWith(
      2,
      10,
      "AGUARDANDO_APROVACAO",
      80,
      "2026-05-01",
      undefined,
      "2026-04-28 12:00:01",
    );
  });

  function prepararFluxoFinalizar() {
    vi.mocked(db.salvarVerificacao).mockResolvedValue(1);
    vi.mocked(db.atualizarStatusEquipamento).mockResolvedValue();
    vi.mocked(db.buscarEquipamento).mockResolvedValue({
      ...equipamentoBase,
      status: "AGUARDANDO_APROVACAO",
    });
    vi.mocked(db.buscarVerificacao).mockResolvedValue(verificacaoBase);
  }

  it("repassa envioManual e avisos do envio", async () => {
    prepararFluxoFinalizar();
    const envioManual = {
      destinatario: { nome: "Cliente Teste", email: "cliente@teste.com" },
      assunto: "Orcamento",
      texto: "texto",
      temSenha: false,
      podeGerarNovaSenha: false,
      equipamentoId: 10,
    } as unknown as NonNullable<Awaited<ReturnType<typeof enviarOrcamentoAoCliente>>["envioManual"]>;
    vi.mocked(enviarOrcamentoAoCliente).mockResolvedValue({
      canais: { whatsapp: { enviado: false, erro: "falhou" }, email: { enviado: true } },
      envioManual,
      avisos: ["aviso 1"],
    });

    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.finalizarVerificacao>> | undefined;
    await act(async () => {
      resposta = await result.current.finalizarVerificacao(equipamentoBase, { ...verificacaoBase });
    });

    expect(resposta?.envioManual).toBe(envioManual);
    expect(resposta?.avisos).toEqual(["aviso 1"]);
    expect(resposta?.canais?.whatsapp).toEqual({ enviado: false, erro: "falhou" });
  });

  it("não envia e-mail quando o operador pula o destinatário", async () => {
    prepararFluxoFinalizar();
    const { result } = renderHook(() => useStatusEquipamento());
    await act(async () => {
      await result.current.finalizarVerificacao(equipamentoBase, { ...verificacaoBase }, "");
    });
    expect(enviarOrcamentoAoCliente).toHaveBeenCalledWith(
      expect.anything(),
      verificacaoBase,
      { enviarEmail: false },
    );
  });

  it("repassa o e-mail digitado no diálogo para o envio", async () => {
    prepararFluxoFinalizar();
    const { result } = renderHook(() => useStatusEquipamento());
    await act(async () => {
      await result.current.finalizarVerificacao(equipamentoBase, { ...verificacaoBase }, "outro@cliente.invalid");
    });
    expect(enviarOrcamentoAoCliente).toHaveBeenCalledWith(
      expect.anything(),
      verificacaoBase,
      { enviarEmail: true, emailDestino: "outro@cliente.invalid" },
    );
  });

  it("falha no envio nao impede a mudanca de status", async () => {
    prepararFluxoFinalizar();
    vi.mocked(enviarOrcamentoAoCliente).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.finalizarVerificacao>> | undefined;
    await act(async () => {
      resposta = await result.current.finalizarVerificacao(equipamentoBase, { ...verificacaoBase });
    });

    expect(db.atualizarStatusEquipamento).toHaveBeenCalledTimes(2);
    expect(resposta?.sucesso).toBe(true);
    expect(resposta?.canais?.whatsapp?.enviado).toBe(false);
    expect(resposta?.canais?.email?.enviado).toBe(false);
    expect(resposta?.avisos?.[0]).toContain("boom");
  });

  it("marca como pronto e retorna status por canal", async () => {
    vi.mocked(db.atualizarStatusEquipamento).mockResolvedValue();
    vi.mocked(db.buscarEquipamento).mockResolvedValue({
      ...equipamentoBase,
      status: "PRONTO",
    });
    vi.mocked(WhatsAppService.enviarEquipamentoPronto).mockResolvedValue({ sucesso: true });

    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.marcarComoPronto>> | undefined;

    await act(async () => {
      resposta = await result.current.marcarComoPronto(equipamentoBase);
    });

    expect(resposta?.sucesso).toBe(true);
    expect(resposta?.canais).toEqual({
      whatsapp: { enviado: true, erro: undefined },
      email: { enviado: true, erro: undefined },
    });
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