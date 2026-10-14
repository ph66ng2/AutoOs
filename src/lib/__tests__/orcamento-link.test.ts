import { afterEach, describe, expect, it, vi } from "vitest";
import {
  enviarLinkOrcamento,
  envioOrcamentoDisponivel,
  registrarProvedorEnvioOrcamento,
} from "@/lib/orcamento-link-envio";
import { montarMensagemLinkOrcamento } from "@/lib/orcamento-link-message";

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

describe("envio do link sem provedor definido", () => {
  const limpar: Array<() => void> = [];
  afterEach(() => limpar.splice(0).forEach((fn) => fn()));

  it("não envia nada enquanto nenhum provedor estiver registrado", async () => {
    expect(envioOrcamentoDisponivel("email")).toBe(false);
    await expect(enviarLinkOrcamento("whatsapp", "+5571999999999", montarMensagemLinkOrcamento(dados)))
      .rejects.toThrow(/não está configurado/);
  });

  it("usa o provedor registrado e permite removê-lo", async () => {
    const enviar = vi.fn().mockResolvedValue(undefined);
    limpar.push(registrarProvedorEnvioOrcamento({ canal: "email", nome: "Teste", enviar }));
    const mensagem = montarMensagemLinkOrcamento(dados);

    await enviarLinkOrcamento("email", " cliente@exemplo.com ", mensagem);
    expect(enviar).toHaveBeenCalledWith("cliente@exemplo.com", mensagem);
    await expect(enviarLinkOrcamento("email", "  ", mensagem)).rejects.toThrow(/destino/);

    limpar.splice(0).forEach((fn) => fn());
    expect(envioOrcamentoDisponivel("email")).toBe(false);
  });
});
