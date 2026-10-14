import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enviarLinkOrcamento,
  envioOrcamentoDisponivel,
  registrarProvedorEnvioOrcamento,
} from "@/lib/orcamento-link-envio";
import { montarMensagemLinkOrcamento } from "@/lib/orcamento-link-message";
import { WhatsAppService } from "@/lib/whatsapp-service";

const dados = {
  clienteNome: "Maria <script>",
  equipamento: "Zebra ZT230",
  valorTotal: 250,
  url: "https://status.bmitag.com.br/#/o/" + "a".repeat(64),
  validoAte: "2026-10-30T20:00:00Z",
};

describe("mensagem do link de decisão", () => {
  it("cita equipamento, valor, link e validade", () => {
    const mensagem = montarMensagemLinkOrcamento(dados);
    expect(mensagem.assunto).toContain("250,00");
    expect(mensagem.texto).toContain("Zebra ZT230");
    expect(mensagem.texto).toContain(dados.url);
    expect(mensagem.texto).toContain("O link vale até");
    expect(mensagem.texto).toContain("Nada é decidido até você confirmar");
  });

  it("escapa o conteúdo do cliente no HTML e dispensa validade quando ausente", () => {
    const mensagem = montarMensagemLinkOrcamento({ ...dados, validoAte: null });
    expect(mensagem.html).toContain("Maria &lt;script&gt;");
    expect(mensagem.html).not.toContain("<script>");
    expect(mensagem.texto).not.toContain("O link vale até");
  });
});

describe("envio do link de decisão", () => {
  const limpar: Array<() => void> = [];
  afterEach(() => {
    limpar.splice(0).forEach((fn) => fn());
    vi.clearAllMocks();
  });

  it("WhatsApp pede o envio à fila do backend, sem texto nem link vindos da tela", async () => {
    const solicitar = vi.spyOn(WhatsAppService, "solicitarEnvio").mockResolvedValue({ sucesso: true, estado: "ENVIADA" });
    expect(envioOrcamentoDisponivel("whatsapp")).toBe(true);

    const resultado = await enviarLinkOrcamento("whatsapp", { equipamentoId: 7, mensagem: montarMensagemLinkOrcamento(dados) });

    expect(resultado.sucesso).toBe(true);
    expect(solicitar).toHaveBeenCalledWith(7, "orcamento_decisao", {});
    expect(JSON.stringify(solicitar.mock.calls)).not.toContain(dados.url);
  });

  it("repassa o gesto de reenvio e a confirmação do resultado incerto", async () => {
    const solicitar = vi.spyOn(WhatsAppService, "solicitarEnvio").mockResolvedValue({ sucesso: true, estado: "ENVIADA" });
    await enviarLinkOrcamento("whatsapp", { equipamentoId: 7 }, { reenvioManual: true, confirmarIncerto: true });
    expect(solicitar).toHaveBeenCalledWith(7, "orcamento_decisao", { reenvioManual: true, confirmarIncerto: true });
  });

  it("email continua sem provedor e recusa o envio", async () => {
    expect(envioOrcamentoDisponivel("email")).toBe(false);
    await expect(enviarLinkOrcamento("email", { equipamentoId: 7 })).rejects.toThrow(/não está configurado/);
  });

  it("usa um provedor de email registrado e permite removê-lo", async () => {
    const enviar = vi.fn().mockResolvedValue({ sucesso: true });
    limpar.push(registrarProvedorEnvioOrcamento({ canal: "email", nome: "Teste", enviar }));
    const contexto = { equipamentoId: 7, mensagem: montarMensagemLinkOrcamento(dados) };

    await enviarLinkOrcamento("email", contexto);
    expect(enviar).toHaveBeenCalledWith(contexto, {});

    limpar.splice(0).forEach((fn) => fn());
    expect(envioOrcamentoDisponivel("email")).toBe(false);
  });
});
