import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Equipamento, PreparoAcessoPortal, Verificacao } from "@/types";

const mockEnviarEmail = vi.hoisted(() => vi.fn());
const mockRegistrarComunicacao = vi.hoisted(() => vi.fn());
const mockGerarOrcamento = vi.hoisted(() => vi.fn());
const mockCopiar = vi.hoisted(() => vi.fn());
const mockRemover = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    enviarEmail: (...args: unknown[]) => mockEnviarEmail(...args),
    registrarComunicacao: (...args: unknown[]) => mockRegistrarComunicacao(...args),
    copiarAnexoEmailParaTemp: (...args: unknown[]) => mockCopiar(...args),
    removerAnexoEmailTemp: (...args: unknown[]) => mockRemover(...args),
  },
}));

vi.mock("@/lib/pdf-service", () => ({
  PdfService: { gerarOrcamento: (...args: unknown[]) => mockGerarOrcamento(...args) },
}));

vi.mock("@/components/clientes/SenhaPortalDialog", () => ({
  PORTAL_URL: "https://portal.exemplo.com",
}));

import {
  enviarEmailOrcamentoPortal,
  gerarCorpoOrcamentoPortalHtml,
  gerarCorpoOrcamentoPortalTexto,
  SENHA_MASCARADA,
} from "@/lib/email-orcamento-portal";

const equip: Equipamento = {
  id: 10,
  serial_number: "SN-E",
  marca: "HP",
  modelo: "M404",
  tipo: "LASER",
  status: "AGUARDANDO_APROVACAO",
  data_entrada: "2026-05-01",
  cliente_nome: "Empresa X",
};

const verificacao: Verificacao = {
  equipamento_id: 10,
  tecnico_nome: "Ivan",
  problema_relatado: "p",
  diagnostico: "d",
  itens_verificados: "[]",
  servicos_necessarios: JSON.stringify([{ id: "1", descricao: "Troca de fusor", valor: 100 }]),
  pecas_necessarias: "[]",
  custo_estimado_mao_obra: 10,
  custo_estimado_pecas: 20,
  custo_total: 100,
  tempo_estimado: 1,
  concluida: true,
  observacoes: "",
};

function preparoBase(over: Partial<PreparoAcessoPortal> = {}, dest: Partial<PreparoAcessoPortal["destinatario"]> = {}): PreparoAcessoPortal {
  return {
    destinatario: {
      contatoId: 1,
      nome: "Maria",
      telefone: "11999999999",
      email: "maria@empresa.com",
      clienteNome: "Empresa X",
      clienteDocumento: "12.345.678/0001-90",
      origem: "CONTATO",
      portalAcesso: "DECIDIR",
      temSenha: true,
      usouSenhaAtual: false,
      precisaContato: false,
      ...dest,
    },
    portalAtivo: true,
    credenciais: { usuario: "maria", senha: "ABCD-1234-WXYZ" },
    senhaExistente: false,
    acessoConcedido: true,
    ...over,
  };
}

describe("email-orcamento-portal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnviarEmail.mockResolvedValue(undefined);
    mockRegistrarComunicacao.mockResolvedValue({});
    mockGerarOrcamento.mockResolvedValue("/fake/orcamento.pdf");
    mockCopiar.mockResolvedValue("/tmp/autoos/orcamento.pdf");
    mockRemover.mockResolvedValue(undefined);
  });

  it("envia ao cliente sem cc e com a senha; cópia interna mascarada", async () => {
    const r = await enviarEmailOrcamentoPortal(equip, verificacao, preparoBase());
    expect(r).toEqual({ cliente: { enviado: true }, copia: { enviado: true } });
    expect(mockGerarOrcamento).toHaveBeenCalledTimes(1);
    expect(mockEnviarEmail).toHaveBeenCalledTimes(2);

    const cliente = mockEnviarEmail.mock.calls[0][0];
    expect(cliente.email).toBe("maria@empresa.com");
    expect(cliente.cc).toEqual([]);
    expect(cliente.corpo_texto).toContain("ABCD-1234-WXYZ");
    expect(cliente.corpo_html).toContain("ABCD-1234-WXYZ");
    expect(cliente.assunto).not.toContain("[Cópia]");

    const copia = mockEnviarEmail.mock.calls[1][0];
    expect(copia.assunto.startsWith("[Cópia] ")).toBe(true);
    expect(copia.email).toBe("medeiros@bmitag.com.br");
    expect(copia.cc).toContain("ivan@bmitag.com.br");
    expect(copia.corpo_texto).not.toContain("ABCD-1234-WXYZ");
    expect(copia.corpo_html).not.toContain("ABCD-1234-WXYZ");
    expect(copia.corpo_texto).toContain(SENHA_MASCARADA);
  });

  it("registra uma única comunicação sem a senha", async () => {
    await enviarEmailOrcamentoPortal(equip, verificacao, preparoBase());
    expect(mockRegistrarComunicacao).toHaveBeenCalledTimes(1);
    const reg = mockRegistrarComunicacao.mock.calls[0][0];
    expect(reg.mensagem).not.toContain("ABCD-1234-WXYZ");
    expect(reg.mensagem).toContain(SENHA_MASCARADA);
    expect(reg.contato).toBe("maria@empresa.com");
    expect(reg.enviado).toBe(true);
  });

  it("falha da cópia não invalida o envio ao cliente", async () => {
    mockEnviarEmail.mockResolvedValueOnce(undefined).mockRejectedValueOnce("smtp caiu");
    const r = await enviarEmailOrcamentoPortal(equip, verificacao, preparoBase());
    expect(r.cliente.enviado).toBe(true);
    expect(r.copia).toEqual({ enviado: false, erro: "smtp caiu" });
  });

  it("sem e-mail do contato não envia", async () => {
    const r = await enviarEmailOrcamentoPortal(equip, verificacao, preparoBase({}, { email: null }));
    expect(r).toEqual({ cliente: { enviado: false, erro: "Contato sem e-mail." }, copia: { enviado: false } });
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("mostra empresa, documento e saudação com o contato", () => {
    const t = gerarCorpoOrcamentoPortalTexto(equip, verificacao, preparoBase(), { mascarar: false });
    expect(t).toContain("Olá, Maria.");
    expect(t).toContain("Empresa: Empresa X — CNPJ/CPF 12.345.678/0001-90");
    expect(t).toContain("Usuário: maria");
    expect(t).toContain("Para aceitar, recusar ou negociar, entre no Portal das Impressoras");
    expect(t).toContain("Equipe técnica");
  });

  it("senha existente mostra o aviso e não mostra Senha:", () => {
    const t = gerarCorpoOrcamentoPortalTexto(
      equip,
      verificacao,
      preparoBase({ credenciais: null, senhaExistente: true }),
      { mascarar: false },
    );
    expect(t).toContain("Use a senha que você já tem. Se esqueceu, fale com a nossa equipe.");
    expect(t).not.toContain("Senha:");
  });

  it("ACOMPANHAR não promete aceitar/recusar", () => {
    const t = gerarCorpoOrcamentoPortalTexto(
      equip,
      verificacao,
      preparoBase({}, { portalAcesso: "ACOMPANHAR" }),
      { mascarar: false },
    );
    expect(t).toContain("Você pode acompanhar o orçamento no Portal das Impressoras");
    expect(t).toContain("Para aprovar, responda este e-mail ou fale com a nossa equipe.");
    expect(t).not.toMatch(/aceitar|recusar|negociar/);
    expect(t).not.toContain("wa.me");
    expect(t).not.toContain("mailto:");
  });

  it("valores em pt-BR com vírgula decimal e separador de milhar", () => {
    const v: Verificacao = {
      ...verificacao,
      custo_total: 1234.5,
      servicos_necessarios: JSON.stringify([{ id: "1", descricao: "Troca de fusor", valor: 150 }]),
    };
    const t = gerarCorpoOrcamentoPortalTexto(equip, v, preparoBase(), { mascarar: false });
    expect(t).toContain("TOTAL: R$ 1.234,50");
    expect(t).toContain("• Troca de fusor: R$ 150,00");
    expect(t).not.toContain("R$ 150.00");
  });

  it("linha da peça mostra nome, quantidade e total (quantidade x valor unitário)", () => {
    const v: Verificacao = {
      ...verificacao,
      servicos_necessarios: JSON.stringify([
        {
          id: "1",
          descricao: "Troca de fusor",
          valor: 100,
          pecas: [{ produto_id: 5, nome: "Fusor HP", quantidade: 2, valor_unitario: 20 }],
        },
      ]),
    };
    const t = gerarCorpoOrcamentoPortalTexto(equip, v, preparoBase(), { mascarar: false });
    expect(t).toContain("      • Fusor HP (x2): R$ 40,00");
  });

  it("HTML mostra a peça com quantidade e total", () => {
    const v: Verificacao = {
      ...verificacao,
      servicos_necessarios: JSON.stringify([
        {
          id: "1",
          descricao: "Troca de fusor",
          valor: 100,
          pecas: [{ produto_id: 5, nome: "Fusor HP", quantidade: 2, valor_unitario: 20.5 }],
        },
      ]),
    };
    const h = gerarCorpoOrcamentoPortalHtml(equip, v, preparoBase(), { mascarar: false });
    expect(h).toContain("• Fusor HP (x2): R$ 41,00");
    expect(h).toContain("R$ 100,00");
  });

  it("sem portal não aparece Senha:", () => {
    const t = gerarCorpoOrcamentoPortalTexto(
      equip,
      verificacao,
      preparoBase({ portalAtivo: false, credenciais: null }),
      { mascarar: false },
    );
    expect(t).not.toContain("Senha:");
    expect(t).not.toContain("Portal das Impressoras");
    expect(t).toContain("APROVADO");
  });
});
