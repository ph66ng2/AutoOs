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
import { calcularPrazoAprovacao, enviarOrcamentoAoCliente } from "@/lib/envio-orcamento";
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
    vi.resetAllMocks();
    vi.mocked(calcularPrazoAprovacao).mockReturnValue("2026-05-01");
    vi.mocked(enviarOrcamentoAoCliente).mockResolvedValue({
      canais: { whatsapp: { enviado: true }, email: { enviado: true } },
      avisos: [],
    });
    vi.mocked(EmailService.enviarEquipamentoPronto).mockResolvedValue({ sucesso: true });
  });

  it("finaliza verificacao e envia o orcamento pela lib de envio", async () => {
    prepararFluxoFinalizar();
    vi.mocked(db.buscarEquipamento).mockRejectedValueOnce(new Error("Leitura indisponível"));
    vi.mocked(db.buscarVerificacao).mockRejectedValueOnce(new Error("Leitura indisponível"));
    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.finalizarVerificacao>> | undefined;

    await act(async () => {
      resposta = await result.current.finalizarVerificacao(equipamentoBase, {
        ...verificacaoBase,
      });
    });

    expect(resposta).toEqual({
      sucesso: true,
      salvo: {
        equipamento: expect.objectContaining({ status: "AGUARDANDO_APROVACAO", valor_orcamento: 80 }),
        verificacao: verificacaoBase,
      },
      canais: {
        whatsapp: { enviado: true },
        email: { enviado: true },
      },
      avisos: [],
    });
    expect(db.buscarEquipamento).not.toHaveBeenCalled();
    expect(db.buscarVerificacao).not.toHaveBeenCalled();
    expect(enviarOrcamentoAoCliente).toHaveBeenCalledTimes(1);
    expect(enviarOrcamentoAoCliente).toHaveBeenCalledWith(
      expect.objectContaining({ status: "AGUARDANDO_APROVACAO", valor_orcamento: 80 }),
      verificacaoBase,
    );
    // Itens, valor, prazo e status numa gravação só: nada de passos de status separados.
    expect(db.salvarVerificacao).toHaveBeenCalledWith({ ...verificacaoBase, enviar_para_aprovacao_prazo: "2026-05-01" });
    expect(db.atualizarStatusEquipamento).not.toHaveBeenCalled();
  });

  function prepararFluxoFinalizar() {
    vi.mocked(db.salvarVerificacao).mockResolvedValue({
      equipamento: { ...equipamentoBase, status: "AGUARDANDO_APROVACAO", valor_orcamento: 80 },
      verificacao: verificacaoBase,
    });
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

  it("falha no envio nao impede a mudanca de status", async () => {
    prepararFluxoFinalizar();
    vi.mocked(enviarOrcamentoAoCliente).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.finalizarVerificacao>> | undefined;
    await act(async () => {
      resposta = await result.current.finalizarVerificacao(equipamentoBase, { ...verificacaoBase });
    });

    expect(db.atualizarStatusEquipamento).not.toHaveBeenCalled();
    expect(resposta?.sucesso).toBe(true);
    expect(resposta?.salvo?.equipamento.status).toBe("AGUARDANDO_APROVACAO");
    expect(resposta?.canais?.whatsapp?.enviado).toBe(false);
    expect(resposta?.canais?.email?.enviado).toBe(false);
    expect(resposta?.avisos?.[0]).toContain("boom");
  });

  it("OS só de garantia já aprovada não vai para AGUARDANDO_APROVACAO nem envia orçamento", async () => {
    vi.mocked(db.salvarVerificacao).mockResolvedValue({
      equipamento: { ...equipamentoBase, status: "APROVADO", valor_orcamento: 0 },
      verificacao: verificacaoBase,
    });
    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.finalizarVerificacao>> | undefined;
    await act(async () => {
      resposta = await result.current.finalizarVerificacao(equipamentoBase, {
        ...verificacaoBase,
        custo_total: 0,
        servicos_necessarios: JSON.stringify([{ id: "g1", descricao: "Garantia", valor: 0 }]),
      });
    });
    expect(resposta?.sucesso).toBe(true);
    expect(db.atualizarStatusEquipamento).not.toHaveBeenCalled();
    expect(enviarOrcamentoAoCliente).not.toHaveBeenCalled();
    expect(resposta?.avisos?.[0]).toMatch(/garantia/i);
  });

  it("não avança status quando salvar verificação recusa total 0 misto", async () => {
    vi.mocked(db.salvarVerificacao).mockRejectedValue(
      new Error("Total R$ 0,00 só segue sem aprovação quando todos os itens são de garantia."),
    );
    const { result } = renderHook(() => useStatusEquipamento());
    let resposta: Awaited<ReturnType<typeof result.current.finalizarVerificacao>> | undefined;
    await act(async () => {
      resposta = await result.current.finalizarVerificacao(equipamentoBase, {
        ...verificacaoBase,
        custo_total: 0,
      });
    });
    expect(resposta?.sucesso).toBe(false);
    expect(db.atualizarStatusEquipamento).not.toHaveBeenCalled();
    expect(enviarOrcamentoAoCliente).not.toHaveBeenCalled();
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

  it("marca como pronto sem enviar e-mail quando o envio é pulado", async () => {
    vi.mocked(db.atualizarStatusEquipamento).mockResolvedValue();
    vi.mocked(db.buscarEquipamento).mockResolvedValue({
      ...equipamentoBase,
      cliente_email: "cliente@example.com",
      status: "PRONTO",
    });
    vi.mocked(WhatsAppService.enviarEquipamentoPronto).mockResolvedValue({ sucesso: true });

    const { result } = renderHook(useStatusEquipamento);
    await act(async () => {
      const resposta = await result.current.marcarComoPronto(equipamentoBase, null);
      expect(resposta.sucesso).toBe(true);
      expect(resposta.canais?.email).toEqual({ enviado: false, erro: "pulado" });
    });
    expect(EmailService.enviarEquipamentoPronto).not.toHaveBeenCalled();
    expect(WhatsAppService.enviarEquipamentoPronto).toHaveBeenCalledOnce();
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