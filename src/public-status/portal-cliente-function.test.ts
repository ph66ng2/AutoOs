// @vitest-environment node

import { createHash, webcrypto } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE_URL = "https://sgaqvxubopgwysnyocjs.supabase.co";
const ORIGIN = "https://status.bmitag.com.br";
const PORTAL_SECRET = "portal-secret-value-with-at-least-32-characters";
const SESSION = "cd".repeat(32);

type Handler = (request: Request) => Promise<Response> | Response;
type RpcCall = { name: string; args: Record<string, unknown> };

let handler: Handler;
let rpcCalls: RpcCall[];
let externalCalls: string[];
let rpcResponses: Record<string, (args: Record<string, unknown>) => { status?: number; body: unknown }>;

function mockResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeAll(async () => {
  const environment: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test_only" }),
    PUBLIC_STATUS_RATE_LIMIT_SECRET: "rate-limit-secret-with-at-least-32-characters",
    PORTAL_CLIENTE_SECRET: PORTAL_SECRET,
    PUBLIC_STATUS_ORIGIN: ORIGIN,
  };
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => environment[name] },
    serve: (next: Handler) => { handler = next; },
  });
  await import("../../supabase/functions/portal-cliente/index.ts");
});

beforeEach(() => {
  rpcCalls = [];
  externalCalls = [];
  rpcResponses = {
    consumir_limite_status_publico: () => ({ body: true }),
    portal_listar_atendimentos: () => ({
      body: { cliente: "Cliente A", contato: "Ana Souza", podeDecidir: true, atendimentos: [{ id: 28, status: "PRONTO", equipamento: "Impressora Zebra" }] },
    }),
    portal_detalhe_atendimento: () => ({
      body: { id: 28, status: "AGUARDANDO_APROVACAO", equipamento: "Impressora Zebra", orcamento: { estado: "ABERTA", versaoId: 9 } },
    }),
    portal_registrar_resposta: () => ({ body: { id: 77, protocolo: "R-77", decisao: "APROVAR" } }),
    portal_registrar_solicitacao: () => ({ body: { id: 5, protocolo: "S-5", tipo: "NEGOCIAR" } }),
    portal_encerrar_sessao: () => ({ body: null }),
    portal_entrar_senha: (args) => ({
      body: args.p_senha === "Ana-Senha-2026" && args.p_documento === "11222333000181"
        ? { resultado: "OK", contato: "Ana Souza", acesso: "DECIDIR", expiraEm: "2026-10-16T20:00:00Z" }
        : { resultado: "INVALIDO" },
    }),
    portal_reverificar_senha: (args) => ({ body: args.p_senha === "Ana-Senha-2026" }),
  };

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (url.origin === SUPABASE_URL && url.pathname.startsWith("/rest/v1/rpc/")) {
      const name = url.pathname.replace("/rest/v1/rpc/", "");
      rpcCalls.push({ name, args: body });
      const responder = rpcResponses[name];
      if (!responder) return mockResponse({ message: "unexpected rpc" }, 500);
      const result = responder(body);
      return mockResponse(result.body, result.status ?? 200);
    }
    externalCalls.push(url.toString());
    return mockResponse({ message: "unexpected external call" }, 500);
  }));
});

async function call(body: Record<string, unknown>, origin = ORIGIN) {
  const response = await handler(new Request(`${SUPABASE_URL}/functions/v1/portal-cliente`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", "cf-connecting-ip": "203.0.113.9" },
    body: JSON.stringify(body),
  }));
  return { response, body: await response.json() as Record<string, unknown> };
}

const rpc = (name: string) => rpcCalls.filter((entry) => entry.name === name);

describe("portal-cliente: sem login por código", () => {
  it.each(["solicitarCodigo", "verificarCodigo", "novoCodigo"])("ação %s não existe mais e não envia nada", async (acao) => {
    const { response } = await call({ acao, documento: "11222333000181", contato: "71988887777", sessao: SESSION, desafio: "0f8fad5b-d9cb-469f-a165-70867728950e", codigo: "123456", canal: "WHATSAPP" });
    expect(response.status).toBe(400);
    expect(externalCalls).toHaveLength(0);
    expect(rpcCalls.map((entry) => entry.name)).not.toContain("portal_criar_desafio");
  });
});

describe("portal-cliente: sessão e orçamento", () => {
  it("exige sessão", async () => {
    const { response } = await call({ acao: "listar" });
    expect(response.status).toBe(401);
  });

  it("lista com o título público de cada etapa", async () => {
    const { response, body } = await call({ acao: "listar", sessao: SESSION });
    expect(response.status).toBe(200);
    expect((body.atendimentos as Array<Record<string, unknown>>)[0].titulo).toBe("Pronto para retirada");
    expect(rpc("portal_listar_atendimentos")[0].args.p_sessao_hash).toBe(createHash("sha256").update(SESSION).digest("hex"));
  });

  it("detalhe usa o mesmo texto de status do link individual e orienta a responder pelo portal", async () => {
    const { body } = await call({ acao: "detalhe", sessao: SESSION, equipamentoId: 28 });
    expect(body.titulo).toBe("O orçamento aguarda sua resposta");
    expect(String(body.orientacao)).toContain("Quero negociar");
  });

  it("depois da resposta, a orientação não manda mais responder pelo outro canal", async () => {
    rpcResponses.portal_detalhe_atendimento = () => ({
      body: { id: 28, status: "AGUARDANDO_APROVACAO", equipamento: "Impressora Zebra", orcamento: { estado: "RESPONDIDA", versaoId: 9 } },
    });
    const { body } = await call({ acao: "detalhe", sessao: SESSION, equipamentoId: 28 });
    expect(body.orientacao).toBe("Sua resposta ao orçamento foi registrada. O andamento dela aparece no quadro do orçamento.");
  });

  it("traduz proposta alterada em 409 com código", async () => {
    rpcResponses.portal_registrar_resposta = () => ({ status: 400, body: { code: "P0001", message: "PROPOSTA_ALTERADA" } });
    const { response, body } = await call({ acao: "responder", sessao: SESSION, equipamentoId: 28, versaoId: 9, decisao: "APROVAR", respostaVigenteId: null });
    expect(response.status).toBe(409);
    expect(body.codigo).toBe("PROPOSTA_ALTERADA");
  });

  it("não vaza erro interno do banco", async () => {
    rpcResponses.portal_detalhe_atendimento = () => ({ status: 500, body: { message: "relation \"equipamentos\" does not exist" } });
    const { response, body } = await call({ acao: "detalhe", sessao: SESSION, equipamentoId: 28 });
    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("relation");
  });

  it("valida decisão e versão antes de chamar o banco", async () => {
    expect((await call({ acao: "responder", sessao: SESSION, equipamentoId: 28, versaoId: 9, decisao: "APROVAR_PARCIAL" })).response.status).toBe(400);
    expect((await call({ acao: "responder", sessao: SESSION, equipamentoId: 28, decisao: "APROVAR" })).response.status).toBe(400);
    expect(rpc("portal_registrar_resposta")).toHaveLength(0);
  });

  it("registra resposta e negociação", async () => {
    const resposta = await call({ acao: "responder", sessao: SESSION, equipamentoId: 28, versaoId: 9, decisao: "APROVAR", respostaVigenteId: 0 });
    expect((resposta.body.comprovante as Record<string, unknown>).protocolo).toBe("R-77");
    const negociacao = await call({ acao: "solicitar", sessao: SESSION, equipamentoId: 28, versaoId: 9, tipo: "NEGOCIAR", mensagem: "" });
    expect((negociacao.body.solicitacao as Record<string, unknown>).protocolo).toBe("S-5");
  });

  it("sem ordem de compra nem contato de retorno, os parâmetros novos nem vão ao banco (compatível com a chamada antiga)", async () => {
    await call({ acao: "responder", sessao: SESSION, equipamentoId: 28, versaoId: 9, decisao: "APROVAR", respostaVigenteId: 0 });
    await call({ acao: "solicitar", sessao: SESSION, equipamentoId: 28, versaoId: 9, tipo: "DUVIDA", mensagem: "Oi" });
    expect(Object.keys(rpc("portal_registrar_resposta")[0].args).sort()).toEqual(
      ["p_decisao", "p_equipamento_id", "p_resposta_vigente_id", "p_sessao_hash", "p_versao_id"]);
    expect(Object.keys(rpc("portal_registrar_solicitacao")[0].args).sort()).toEqual(
      ["p_equipamento_id", "p_mensagem", "p_sessao_hash", "p_tipo", "p_versao_id"]);
  });

  it("repassa a ordem de compra (sem espaços nas pontas) ao aprovar", async () => {
    const { response } = await call({ acao: "responder", sessao: SESSION, equipamentoId: 28, versaoId: 9, decisao: "APROVAR", respostaVigenteId: 0, ordemCompra: "  PO-2026/0042 " });
    expect(response.status).toBe(200);
    expect(rpc("portal_registrar_resposta")[0].args.p_ordem_compra).toBe("PO-2026/0042");
  });

  it("recusa ordem de compra com mais de 60 caracteres ou de tipo errado antes de chamar o banco", async () => {
    const base = { acao: "responder", sessao: SESSION, equipamentoId: 28, versaoId: 9, decisao: "APROVAR", respostaVigenteId: 0 };
    expect((await call({ ...base, ordemCompra: "9".repeat(61) })).response.status).toBe(400);
    expect((await call({ ...base, ordemCompra: 123 })).response.status).toBe(400);
    expect(rpc("portal_registrar_resposta")).toHaveLength(0);
    expect((await call({ ...base, ordemCompra: "9".repeat(60) })).response.status).toBe(200);
  });

  it("traduz ORDEM_COMPRA_OBRIGATORIA em 422 com mensagem e código", async () => {
    rpcResponses.portal_registrar_resposta = () => ({ status: 400, body: { code: "P0001", message: "ORDEM_COMPRA_OBRIGATORIA" } });
    const { response, body } = await call({ acao: "responder", sessao: SESSION, equipamentoId: 28, versaoId: 9, decisao: "APROVAR", respostaVigenteId: 0 });
    expect(response.status).toBe(422);
    expect(body).toEqual({ erro: "Informe o número da ordem de compra para aprovar.", codigo: "ORDEM_COMPRA_OBRIGATORIA" });
  });

  it("repassa telefone, e-mail e salvarNoContato na solicitação", async () => {
    const { response } = await call({
      acao: "solicitar", sessao: SESSION, equipamentoId: 28, versaoId: 9, tipo: "NEGOCIAR", mensagem: "Desconto?",
      telefone: " (71) 91234-5678 ", email: "ana@cliente.invalid", salvarNoContato: true,
    });
    expect(response.status).toBe(200);
    expect(rpc("portal_registrar_solicitacao")[0].args).toMatchObject({
      p_mensagem: "Desconto?", p_telefone: "(71) 91234-5678", p_email: "ana@cliente.invalid", p_salvar_no_contato: true,
    });
  });

  it("valida o tipo dos campos de contato e traduz CONTATO_INVALIDO em 400", async () => {
    const base = { acao: "solicitar", sessao: SESSION, equipamentoId: 28, versaoId: 9, tipo: "DUVIDA", mensagem: "Oi" };
    expect((await call({ ...base, telefone: 71912345678 })).response.status).toBe(400);
    expect((await call({ ...base, salvarNoContato: "sim" })).response.status).toBe(400);
    const longo = await call({ ...base, email: `${"a".repeat(200)}@x.com` });
    expect(longo.response.status).toBe(400);
    expect(longo.body.codigo).toBe("CONTATO_INVALIDO");
    expect(rpc("portal_registrar_solicitacao")).toHaveLength(0);

    rpcResponses.portal_registrar_solicitacao = () => ({ status: 400, body: { code: "P0001", message: "CONTATO_INVALIDO" } });
    const { response, body } = await call({ ...base, telefone: "123" });
    expect(response.status).toBe(400);
    expect(body).toEqual({ erro: "Confira o telefone ou o e-mail informado.", codigo: "CONTATO_INVALIDO" });
  });

  it("no detalhe, fotos ganham url absoluta e perdem o caminho", async () => {
    rpcResponses.portal_detalhe_atendimento = () => ({
      body: {
        id: 28, status: "PRONTO", equipamento: "Impressora Zebra",
        defeitoRelatado: "Não imprime", valores: { orcamento: 120, final: null, atual: 120 },
        fotos: [
          { id: 1, categoria: "ENTRADA", caminho: "equipamento-imagens/1/28/10.jpg", largura: 640, altura: 480 },
          { id: 2, categoria: "VERIFICACAO", caminho: `${SUPABASE_URL}/storage/v1/object/public/equipamento-imagens/1/28/11.png`, largura: null, altura: null },
          { id: 8, categoria: "ENTRADA", caminho: "https://cdn.exemplo.invalid/v.png", largura: 1, altura: 1 },
          { id: 9, categoria: "ENTRADA", caminho: `${SUPABASE_URL}/rest/v1/clientes`, largura: 1, altura: 1 },
          { id: 10, categoria: "ENTRADA", caminho: "https://outro.supabase.co/storage/v1/object/public/x.jpg", largura: 1, altura: 1 },
          { id: 3, categoria: "SAIDA", caminho: "/equipamento-imagens/1/28/12.jpg", largura: 800, altura: 600 },
          { id: 4, categoria: "ENTRADA", caminho: "../segredo/x.jpg", largura: 1, altura: 1 },
          { id: 5, categoria: "ENTRADA", caminho: "http://inseguro.invalid/x.jpg", largura: 1, altura: 1 },
          { id: 6, categoria: "ENTRADA", caminho: "javascript:alert(1)", largura: 1, altura: 1 },
          { id: 7, categoria: "ENTRADA", caminho: null, largura: 1, altura: 1 },
        ],
      },
    });
    const { body } = await call({ acao: "detalhe", sessao: SESSION, equipamentoId: 28 });
    const fotos = body.fotos as Array<Record<string, unknown>>;
    expect(fotos).toEqual([
      { id: 1, categoria: "ENTRADA", url: `${SUPABASE_URL}/storage/v1/object/public/equipamento-imagens/1/28/10.jpg`, largura: 640, altura: 480 },
      { id: 2, categoria: "VERIFICACAO", url: `${SUPABASE_URL}/storage/v1/object/public/equipamento-imagens/1/28/11.png`, largura: null, altura: null },
      { id: 3, categoria: "SAIDA", url: `${SUPABASE_URL}/storage/v1/object/public/equipamento-imagens/1/28/12.jpg`, largura: 800, altura: 600 },
    ]);
    expect(JSON.stringify(body)).not.toContain("caminho");
    expect(body.defeitoRelatado).toBe("Não imprime");
    expect(body.valores).toEqual({ orcamento: 120, final: null, atual: 120 });
  });

  it("detalhe sem fotos (função antiga) continua funcionando", async () => {
    const { response, body } = await call({ acao: "detalhe", sessao: SESSION, equipamentoId: 28 });
    expect(response.status).toBe(200);
    expect(body).not.toHaveProperty("fotos");
  });

  it("recusa origem desconhecida", async () => {
    const { response } = await call({ acao: "listar", sessao: SESSION }, "https://evil.example");
    expect(response.status).toBe(403);
  });
});

describe("portal-cliente: senha definida pelo operador", () => {
  it("entra com CPF/CNPJ + senha e devolve token cujo hash vai ao banco", async () => {
    const { response, body } = await call({ acao: "entrarSenha", documento: "11.222.333/0001-81", senha: "Ana-Senha-2026" });
    expect(response.status).toBe(200);
    const args = rpc("portal_entrar_senha")[0].args;
    expect(args.p_documento).toBe("11222333000181");
    expect(args.p_nova_sessao_hash).toBe(createHash("sha256").update(String(body.sessao)).digest("hex"));
  });

  it("senha errada e CNPJ desconhecido têm a mesma resposta", async () => {
    const errada = await call({ acao: "entrarSenha", documento: "11222333000181", senha: "outra-1234" });
    const desconhecido = await call({ acao: "entrarSenha", documento: "00000000000191", senha: "Ana-Senha-2026" });
    expect(errada.response.status).toBe(400);
    expect(desconhecido.response.status).toBe(400);
    expect(errada.body).toEqual(desconhecido.body);
    expect(JSON.stringify(errada.body)).not.toContain("sessao");
  });

  it("limita tentativas de senha por documento", async () => {
    rpcResponses.consumir_limite_status_publico = (() => {
      let count = 0;
      return () => ({ body: ++count === 1 });
    })();
    const { response } = await call({ acao: "entrarSenha", documento: "11222333000181", senha: "Ana-Senha-2026" });
    expect(response.status).toBe(429);
    expect(rpc("portal_entrar_senha")).toHaveLength(0);
  });

  it("reconfirma a senha da sessão antes de decidir", async () => {
    expect((await call({ acao: "confirmarSenha", sessao: SESSION, senha: "errada-1" })).response.status).toBe(400);
    expect((await call({ acao: "confirmarSenha", sessao: SESSION, senha: "Ana-Senha-2026" })).response.status).toBe(200);
  });
});
