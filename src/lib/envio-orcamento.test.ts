import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepararAcessoPortal: vi.fn(),
  obterDestinatarioOrcamento: vi.fn(),
  buscarEquipamento: vi.fn(),
  buscarVerificacao: vi.fn(),
  prorrogarPrazoOrcamento: vi.fn(),
  publicarOrcamentoPortal: vi.fn(),
  solicitarEnvio: vi.fn(),
  enviarEmailOrcamentoPortal: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    prepararAcessoPortal: mocks.prepararAcessoPortal,
    obterDestinatarioOrcamento: mocks.obterDestinatarioOrcamento,
    buscarEquipamento: mocks.buscarEquipamento,
    buscarVerificacao: mocks.buscarVerificacao,
    prorrogarPrazoOrcamento: mocks.prorrogarPrazoOrcamento,
    publicarOrcamentoPortal: mocks.publicarOrcamentoPortal,
  },
}));
vi.mock("@/lib/whatsapp-service", () => ({
  WhatsAppService: { solicitarEnvio: mocks.solicitarEnvio },
}));
vi.mock("@/lib/email-orcamento-portal", () => ({
  enviarEmailOrcamentoPortal: mocks.enviarEmailOrcamentoPortal,
  gerarCorpoOrcamentoPortalTexto: (_e: unknown, _v: unknown, p: any, o: { mascarar: boolean }) =>
    `texto ${o.mascarar ? "mascarado" : p.credenciais?.senha ?? "sem-senha"}`,
}));

import {
  calcularPrazoAprovacao,
  enviarOrcamentoAoCliente,
  gerarNovaSenhaEnvioManual,
  prorrogarEEnviar,
  sugerirNovoPrazo,
} from "./envio-orcamento";

const equip: any = { id: 7, marca: "HP", modelo: "M404", serial_number: "SN1", atualizado_em: "t1" };
const verif: any = { equipamento_id: 7 };

function preparo(over: any = {}) {
  return {
    destinatario: {
      contatoId: 3,
      nome: "Ana",
      telefone: "11",
      email: "ana@x.com",
      clienteNome: "Cli",
      clienteDocumento: "1",
      origem: "RESPONSAVEL",
      portalAcesso: "DECIDIR",
      temSenha: true,
      usouSenhaAtual: false,
      precisaContato: false,
    },
    portalAtivo: true,
    credenciais: { usuario: "u", senha: "S3NHA" },
    senhaExistente: false,
    acessoConcedido: true,
    ...over,
  };
}

const okWpp = { sucesso: true, estado: "ENVIADA" };
const okEmail = { cliente: { enviado: true }, copia: { enviado: true } };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("prazo", () => {
  it("sugere data AAAA-MM-DD", () => {
    expect(sugerirNovoPrazo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calcularPrazoAprovacao(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("enviarOrcamentoAoCliente", () => {
  it("prepara uma vez e usa a mesma senha no WhatsApp e no e-mail", async () => {
    const p = preparo();
    mocks.prepararAcessoPortal.mockResolvedValue(p);
    mocks.solicitarEnvio.mockResolvedValue(okWpp);
    mocks.enviarEmailOrcamentoPortal.mockResolvedValue(okEmail);

    const r = await enviarOrcamentoAoCliente(equip, verif);

    expect(mocks.prepararAcessoPortal).toHaveBeenCalledTimes(1);
    expect(mocks.solicitarEnvio.mock.calls[0][2].senhaPortal).toBe("S3NHA");
    expect(mocks.enviarEmailOrcamentoPortal).toHaveBeenCalledWith(equip, verif, p);
    expect(r.canais.whatsapp.enviado).toBe(true);
    expect(r.canais.email.enviado).toBe(true);
    expect(r.envioManual).toBeUndefined();
    expect(JSON.stringify(r.avisos)).not.toContain("S3NHA");
  });

  it("reaproveita o preparo numa segunda tentativa e a senha criada não se perde", async () => {
    const p = preparo();
    mocks.prepararAcessoPortal.mockResolvedValue(p);
    mocks.solicitarEnvio.mockResolvedValue(okWpp);

    const primeira = await enviarOrcamentoAoCliente(equip, verif, { enviarEmail: false });
    expect(primeira.preparo).toBe(p);
    await enviarOrcamentoAoCliente(equip, verif, { enviarEmail: false, confirmarIncerto: true, preparo: primeira.preparo });

    expect(mocks.prepararAcessoPortal).toHaveBeenCalledTimes(1);
    expect(mocks.solicitarEnvio.mock.calls[1][2].senhaPortal).toBe("S3NHA");
  });

  it("falha do WhatsApp gera envioManual com a senha", async () => {
    mocks.prepararAcessoPortal.mockResolvedValue(preparo());
    mocks.solicitarEnvio.mockResolvedValue({ sucesso: false, estado: "FALHOU", erro: "x" });
    mocks.enviarEmailOrcamentoPortal.mockResolvedValue(okEmail);

    const r = await enviarOrcamentoAoCliente(equip, verif);

    expect(r.envioManual?.texto).toContain("S3NHA");
    expect(r.envioManual?.temSenha).toBe(true);
    expect(r.envioManual?.podeGerarNovaSenha).toBe(true);
    expect(r.envioManual?.equipamentoId).toBe(7);
    expect(r.envioManual?.assunto).toBe("Orçamento - HP M404 (SN: SN1)");
  });

  it("WhatsApp sem configuração e e-mail entregue não abre o envio manual", async () => {
    mocks.prepararAcessoPortal.mockResolvedValue(preparo());
    mocks.solicitarEnvio.mockResolvedValue({ sucesso: false, erro: "Configure o WhatsApp primeiro." });
    mocks.enviarEmailOrcamentoPortal.mockResolvedValue(okEmail);

    const r = await enviarOrcamentoAoCliente(equip, verif);

    expect(r.canais.email.enviado).toBe(true);
    expect(r.canais.whatsapp.enviado).toBe(false);
    expect(r.envioManual).toBeUndefined();
  });

  it("WhatsApp sem configuração e e-mail que falhou ainda abre o envio manual", async () => {
    mocks.prepararAcessoPortal.mockResolvedValue(preparo());
    mocks.solicitarEnvio.mockResolvedValue({ sucesso: false, erro: "Configure o WhatsApp primeiro." });
    mocks.enviarEmailOrcamentoPortal.mockResolvedValue({ cliente: { enviado: false, erro: "falhou" }, copia: { enviado: false } });

    const r = await enviarOrcamentoAoCliente(equip, verif);

    expect(r.envioManual).toBeDefined();
  });

  it("outra falha do WhatsApp com e-mail entregue continua abrindo o envio manual", async () => {
    mocks.prepararAcessoPortal.mockResolvedValue(preparo());
    mocks.solicitarEnvio.mockResolvedValue({ sucesso: false, erro: "Token inválido." });
    mocks.enviarEmailOrcamentoPortal.mockResolvedValue(okEmail);

    const r = await enviarOrcamentoAoCliente(equip, verif);

    expect(r.envioManual).toBeDefined();
  });

  it("WhatsApp INCERTA gera envioManual", async () => {
    mocks.prepararAcessoPortal.mockResolvedValue(preparo());
    mocks.solicitarEnvio.mockResolvedValue({ sucesso: true, estado: "INCERTA" });
    mocks.enviarEmailOrcamentoPortal.mockResolvedValue(okEmail);
    const r = await enviarOrcamentoAoCliente(equip, verif);
    expect(r.envioManual).toBeDefined();
  });

  it("senhaRetida gera envioManual mesmo com WhatsApp enviado", async () => {
    mocks.prepararAcessoPortal.mockResolvedValue(preparo());
    mocks.solicitarEnvio.mockResolvedValue({ ...okWpp, senhaRetida: true });
    mocks.enviarEmailOrcamentoPortal.mockResolvedValue(okEmail);
    const r = await enviarOrcamentoAoCliente(equip, verif);
    expect(r.envioManual?.texto).toContain("S3NHA");
  });

  it("sem preparo o fluxo segue sem credenciais", async () => {
    mocks.prepararAcessoPortal.mockRejectedValue(new Error("boom"));
    mocks.solicitarEnvio.mockResolvedValue(okWpp);

    const r = await enviarOrcamentoAoCliente(equip, verif);

    expect(mocks.solicitarEnvio.mock.calls[0][2].senhaPortal).toBeUndefined();
    expect(mocks.enviarEmailOrcamentoPortal).not.toHaveBeenCalled();
    expect(r.avisos[0]).toContain("Não foi possível preparar o acesso ao portal: boom");
    expect(r.canais.whatsapp.enviado).toBe(true);
  });

  it("retornos undefined de mocks não quebram", async () => {
    const r = await enviarOrcamentoAoCliente(equip, verif);
    expect(r.canais.whatsapp.enviado).toBe(false);
    expect(r.canais.email.enviado).toBe(false);
  });

  it("enviarEmail=false não envia e-mail", async () => {
    mocks.prepararAcessoPortal.mockResolvedValue(preparo());
    mocks.solicitarEnvio.mockResolvedValue(okWpp);
    await enviarOrcamentoAoCliente(equip, verif, { enviarEmail: false });
    expect(mocks.enviarEmailOrcamentoPortal).not.toHaveBeenCalled();
  });
});

describe("gerarNovaSenhaEnvioManual", () => {
  it("força nova senha", async () => {
    mocks.prepararAcessoPortal.mockResolvedValue(preparo());
    const r = await gerarNovaSenhaEnvioManual(equip, verif);
    expect(mocks.prepararAcessoPortal).toHaveBeenCalledWith(7, true);
    expect(r?.texto).toContain("S3NHA");
  });

  it("relança erro com mensagem clara", async () => {
    mocks.prepararAcessoPortal.mockRejectedValue("falhou");
    await expect(gerarNovaSenhaEnvioManual(equip, verif)).rejects.toThrow(/nova senha.*falhou/);
  });
});

describe("prorrogarEEnviar", () => {
  beforeEach(() => {
    mocks.buscarEquipamento.mockResolvedValue({ ...equip });
    mocks.buscarVerificacao.mockResolvedValue(verif);
    mocks.prepararAcessoPortal.mockResolvedValue(preparo());
    mocks.solicitarEnvio.mockResolvedValue(okWpp);
    mocks.enviarEmailOrcamentoPortal.mockResolvedValue(okEmail);
  });

  it("falha na publicação vira aviso e o envio segue", async () => {
    mocks.prorrogarPrazoOrcamento.mockResolvedValue({ prorrogado: true, respostaPendente: null, equipamento: equip });
    mocks.publicarOrcamentoPortal.mockRejectedValue(new Error("sem portal"));

    const r = await prorrogarEEnviar(equip, "2026-12-01", async () => true);

    expect(r.prorrogado).toBe(true);
    expect(r.publicado).toBe(false);
    expect(r.avisos.join(" ")).toContain("sem portal");
    expect(mocks.solicitarEnvio).toHaveBeenCalledTimes(1);
    expect(mocks.solicitarEnvio.mock.calls[0][2].reenvioManual).toBe(true);
    expect(r.whatsapp?.enviado).toBe(true);
  });

  it("reaproveita o preparo de uma tentativa anterior e não prepara o acesso de novo", async () => {
    const p = preparo();
    mocks.buscarEquipamento.mockResolvedValue({ ...equip, atualizado_em: "t1" });
    mocks.prorrogarPrazoOrcamento.mockResolvedValue({ prorrogado: true, equipamento: { ...equip, atualizado_em: "t2" } });
    mocks.publicarOrcamentoPortal.mockResolvedValue({});
    mocks.buscarVerificacao.mockResolvedValue(verif);
    mocks.solicitarEnvio.mockResolvedValue(okWpp);

    await prorrogarEEnviar(equip, "2030-01-01", async () => true, { preparo: p });

    expect(mocks.prepararAcessoPortal).not.toHaveBeenCalled();
    expect(mocks.solicitarEnvio.mock.calls[0][2].senhaPortal).toBe("S3NHA");
  });

  it("resposta pendente confirmada repete com confirmação", async () => {
    mocks.prorrogarPrazoOrcamento
      .mockResolvedValueOnce({ prorrogado: false, respostaPendente: { x: 1 }, equipamento: null })
      .mockResolvedValueOnce({ prorrogado: true, respostaPendente: null, equipamento: equip });
    mocks.publicarOrcamentoPortal.mockResolvedValue({});
    const r = await prorrogarEEnviar(equip, "2026-12-01", async () => true);
    expect(mocks.prorrogarPrazoOrcamento.mock.calls[1][0].confirmarRespostaPendente).toBe(true);
    expect(r.publicado).toBe(true);
  });

  it("resposta pendente recusada não prorroga nem envia", async () => {
    mocks.prorrogarPrazoOrcamento.mockResolvedValue({ prorrogado: false, respostaPendente: { x: 1 }, equipamento: null });
    const r = await prorrogarEEnviar(equip, "2026-12-01", async () => false);
    expect(r.respostaPendenteRecusada).toBe(true);
    expect(r.prorrogado).toBe(false);
    expect(mocks.prorrogarPrazoOrcamento).toHaveBeenCalledTimes(1);
    expect(mocks.publicarOrcamentoPortal).not.toHaveBeenCalled();
    expect(mocks.solicitarEnvio).not.toHaveBeenCalled();
  });
});
