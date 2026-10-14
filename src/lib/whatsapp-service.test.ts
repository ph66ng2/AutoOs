import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Equipamento, ResultadoEnvioWhatsapp } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());
const mockRegistrarComunicacao = vi.hoisted(() => vi.fn());
const mockSolicitarEnvio = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/lib/db", () => ({
  db: {
    registrarComunicacao: (...args: unknown[]) => mockRegistrarComunicacao(...args),
    solicitarEnvioWhatsapp: (...args: unknown[]) => mockSolicitarEnvio(...args),
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

const resposta = (estado: ResultadoEnvioWhatsapp["estado"], mensagem?: string): ResultadoEnvioWhatsapp => ({
  pedidoId: 1,
  tentativaId: 1,
  estado,
  mensagem,
});

describe("WhatsAppService — pedidos de envio ao backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSolicitarEnvio.mockResolvedValue(resposta("ENVIADA"));
  });

  it("orçamento pede só o equipamento e o tipo: o texto é montado no backend", async () => {
    const res = await WhatsAppService.enviarOrcamento(equipamentoBase);

    expect(res).toEqual({ sucesso: true, estado: "ENVIADA" });
    expect(mockSolicitarEnvio).toHaveBeenCalledWith({
      equipamento_id: 20,
      tipo: "orcamento_informativo",
      reenvio_manual: false,
      confirmar_incerto: false,
    });
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockRegistrarComunicacao).not.toHaveBeenCalled();
  });

  it("equipamento pronto e link de decisão usam o mesmo comando com tipos próprios", async () => {
    await WhatsAppService.enviarEquipamentoPronto(equipamentoBase);
    await WhatsAppService.enviarLinkDecisaoOrcamento(20);

    expect(mockSolicitarEnvio.mock.calls.map(([entrada]) => entrada.tipo)).toEqual([
      "equipamento_pronto",
      "orcamento_decisao",
    ]);
  });

  it("reenvio manual e confirmação do resultado incerto seguem para o backend", async () => {
    await WhatsAppService.enviarEquipamentoPronto(equipamentoBase, { reenvioManual: true, confirmarIncerto: true });

    expect(mockSolicitarEnvio).toHaveBeenCalledWith(expect.objectContaining({
      reenvio_manual: true,
      confirmar_incerto: true,
    }));
  });

  it("modo central: a mensagem enfileirada conta como sucesso e avisa que ainda não saiu", async () => {
    mockSolicitarEnvio.mockResolvedValue(resposta("ENFILEIRADA", "Mensagem na fila; será enviada em instantes."));
    const res = await WhatsAppService.enviarEquipamentoPronto(equipamentoBase);

    expect(res).toMatchObject({ sucesso: true, estado: "ENFILEIRADA", enfileirada: true });
  });

  it("evento já solicitado não é erro para o gatilho automático", async () => {
    mockSolicitarEnvio.mockResolvedValue(resposta("JA_SOLICITADO", "Já solicitado."));
    const res = await WhatsAppService.enviarOrcamento(equipamentoBase);

    expect(res.sucesso).toBe(true);
    expect(res.jaSolicitado).toBe(true);
  });

  it("resultado incerto pede confirmação em vez de repetir sozinho", async () => {
    mockSolicitarEnvio.mockResolvedValue(resposta("REQUER_CONFIRMACAO", "Resultado incerto."));
    const res = await WhatsAppService.enviarOrcamento(equipamentoBase, undefined, { reenvioManual: true });

    expect(res).toMatchObject({ sucesso: false, requerConfirmacao: true, erro: "Resultado incerto." });
  });

  it("falha do provedor, envio em andamento e erro de comando viram sucesso=false", async () => {
    mockSolicitarEnvio.mockResolvedValueOnce(resposta("FALHOU", "Configure o WhatsApp primeiro"));
    expect(await WhatsAppService.enviarOrcamento(equipamentoBase)).toMatchObject({
      sucesso: false,
      estado: "FALHOU",
      erro: "Configure o WhatsApp primeiro",
    });

    mockSolicitarEnvio.mockResolvedValueOnce(resposta("EM_ANDAMENTO", "Já existe um envio em andamento."));
    expect((await WhatsAppService.enviarOrcamento(equipamentoBase)).sucesso).toBe(false);

    mockSolicitarEnvio.mockRejectedValueOnce("O orçamento só pode ser enviado enquanto aguarda aprovação.");
    expect(await WhatsAppService.enviarOrcamento(equipamentoBase)).toEqual({
      sucesso: false,
      estado: "FALHOU",
      erro: "O orçamento só pode ser enviado enquanto aguarda aprovação.",
    });
  });
});

describe("WhatsAppService — link de acompanhamento (envio direto)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it("normaliza o DDI, envia e registra o histórico sem o token", async () => {
    const url = `https://status.bmitag.com.br/#/c/${"a".repeat(64)}`;
    const res = await WhatsAppService.enviarLinkStatusPublico(equipamentoBase, url);

    expect(res).toEqual({ sucesso: true });
    expect(mockInvoke).toHaveBeenCalledWith(
      "enviar_whatsapp",
      expect.objectContaining({ input: { contato: "5511988776655", mensagem: expect.stringContaining(url) } }),
    );
    const registrado = mockRegistrarComunicacao.mock.calls[0]![0];
    expect(registrado).toMatchObject({ tipo: "STATUS_PUBLICO", canal: "WHATSAPP", enviado: true });
    expect(registrado.mensagem).not.toContain("a".repeat(64));
  });

  it("não envia sem telefone cadastrado", async () => {
    const res = await WhatsAppService.enviarLinkStatusPublico(
      { ...equipamentoBase, cliente_telefone: "", responsavel_telefone: "" },
      "https://status.bmitag.com.br/#/c/x",
    );
    expect(res.sucesso).toBe(false);
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
