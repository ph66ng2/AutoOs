// @vitest-environment node

import { createHash, createHmac, webcrypto } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE_URL = "https://sgaqvxubopgwysnyocjs.supabase.co";
const ORIGIN = "https://status.bmitag.com.br";
const PORTAL_SECRET = "portal-secret-value-with-at-least-32-characters";
const PROVIDER_TOKEN = "evolution-token-super-secreto";
const SESSION = "cd".repeat(32);

type Handler = (request: Request) => Promise<Response> | Response;
type RpcCall = { name: string; args: Record<string, unknown> };

let handler: Handler;
let rpcCalls: RpcCall[];
let providerCalls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }>;
let rpcResponses: Record<string, (args: Record<string, unknown>) => { status?: number; body: unknown }>;
let providerStatus: number;

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
    WHATSAPP_TOKENS: JSON.stringify({ "3": PROVIDER_TOKEN }),
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
  providerCalls = [];
  providerStatus = 200;
  rpcResponses = {
    consumir_limite_status_publico: () => ({ body: true }),
    portal_criar_desafio: (args) => ({
      body: args.p_destino === "71988887777"
        ? [{ desafio_id: 41, empresa_id: 3, canal: "WHATSAPP", destino: "71988887777", contato_nome: "Ana Souza" }]
        : [],
    }),
    portal_config_envio_whatsapp: () => ({
      body: [{ provedor: "EVOLUTION", evolution_api_url: "https://evo.example/message/sendText/bmi", cloud_phone_number_id: null, cloud_idioma: "pt_BR" }],
    }),
    portal_registrar_entrega_codigo: () => ({ body: null }),
    portal_verificar_codigo: () => ({ body: { resultado: "OK", contato: "Ana Souza", acesso: "DECIDIR", expiraEm: "2026-10-15T20:00:00Z", reverificada: false } }),
    portal_listar_atendimentos: () => ({
      body: { cliente: "Cliente A", contato: "Ana Souza", podeDecidir: true, atendimentos: [{ id: 28, status: "PRONTO", equipamento: "Impressora Zebra" }] },
    }),
    portal_detalhe_atendimento: () => ({
      body: { id: 28, status: "AGUARDANDO_APROVACAO", equipamento: "Impressora Zebra", orcamento: { estado: "ABERTA", versaoId: 9 } },
    }),
    portal_registrar_resposta: () => ({ body: { id: 77, protocolo: "R-77", decisao: "APROVAR" } }),
    portal_registrar_solicitacao: () => ({ body: { id: 5, protocolo: "S-5", tipo: "NEGOCIAR" } }),
    portal_encerrar_sessao: () => ({ body: null }),
    portal_metodo_sessao: () => ({ body: "SENHA" }),
    portal_entrar_senha: (args) => ({
      body: args.p_senha === "Ana-Senha-2026" && args.p_documento === "11222333000181"
        ? { resultado: "OK", contato: "Ana Souza", acesso: "DECIDIR", expiraEm: "2026-10-16T20:00:00Z", metodo: "SENHA" }
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
    providerCalls.push({ url: url.toString(), body, headers: new Headers(init?.headers) });
    return mockResponse(providerStatus === 200 ? { key: { id: "abc" } } : { error: `token ${PROVIDER_TOKEN} invalid` }, providerStatus);
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

describe("portal-cliente: código de acesso", () => {
  it("responde igual quando os dados não conferem e não envia nada", async () => {
    const { response, body } = await call({ acao: "solicitarCodigo", documento: "11.222.333/0001-81", contato: "71900000000" });
    expect(response.status).toBe(200);
    expect(body.mensagem).toMatch(/Se os dados conferirem/);
    expect(providerCalls).toHaveLength(0);
    expect(rpc("portal_registrar_entrega_codigo")).toHaveLength(0);
  });

  it("envia o código pelo WhatsApp da empresa e guarda só o HMAC", async () => {
    const { response, body } = await call({ acao: "solicitarCodigo", documento: "11222333000181", contato: "71988887777" });
    expect(response.status).toBe(200);
    expect(providerCalls).toHaveLength(1);
    const sent = String(providerCalls[0].body.text);
    const code = sent.match(/\b(\d{6})\b/)?.[1];
    expect(code).toBeDefined();
    expect(providerCalls[0].body.number).toBe("5571988887777");
    expect(providerCalls[0].headers.get("apikey")).toBe(PROVIDER_TOKEN);

    const created = rpc("portal_criar_desafio")[0].args;
    expect(created.p_desafio_ref).toBe(body.desafio);
    const expected = createHmac("sha256", PORTAL_SECRET).update(`otp:${body.desafio}:${code}`).digest("hex");
    expect(created.p_codigo_hash).toBe(expected);
    expect(JSON.stringify(rpcCalls)).not.toContain(`"${code}"`);
    expect(rpc("portal_registrar_entrega_codigo")[0].args).toMatchObject({ p_desafio_id: 41, p_estado: "ENVIADO" });
  });

  it("código não entregue responde igual ao contato inexistente e registra a falha sem vazar o token", async () => {
    providerStatus = 401;
    const { response, body } = await call({ acao: "solicitarCodigo", documento: "11222333000181", contato: "71988887777" });
    // Resposta diferente revelaria que o par CPF/CNPJ + contato existe.
    expect(response.status).toBe(200);
    expect(body.codigo).toBeUndefined();
    expect(typeof body.desafio).toBe("string");
    const registro = rpc("portal_registrar_entrega_codigo")[0].args;
    expect(registro.p_estado).toBe("FALHOU");
    expect(String(registro.p_erro)).not.toContain(PROVIDER_TOKEN);
  });

  it("limita pedidos por documento", async () => {
    // Primeira chamada: limite por IP (passa). Segunda: limite por documento (estourado).
    rpcResponses.consumir_limite_status_publico = (() => {
      let count = 0;
      return () => ({ body: ++count === 1 });
    })();
    const { response } = await call({ acao: "solicitarCodigo", documento: "11222333000181", contato: "71988887777" });
    expect(response.status).toBe(429);
    expect(providerCalls).toHaveLength(0);
  });

  it("verifica o código e devolve um token cujo hash vai ao banco", async () => {
    const ref = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const { response, body } = await call({ acao: "verificarCodigo", desafio: ref, codigo: "123456" });
    expect(response.status).toBe(200);
    expect(body.sessao).toMatch(/^[0-9a-f]{64}$/);
    const args = rpc("portal_verificar_codigo")[0].args;
    expect(args.p_nova_sessao_hash).toBe(createHash("sha256").update(String(body.sessao)).digest("hex"));
    expect(args.p_codigo_hash).toBe(createHmac("sha256", PORTAL_SECRET).update(`otp:${ref}:123456`).digest("hex"));
  });

  it("código errado informa tentativas restantes", async () => {
    rpcResponses.portal_verificar_codigo = () => ({ body: { resultado: "CODIGO_INVALIDO", tentativasRestantes: 3 } });
    const { response, body } = await call({ acao: "verificarCodigo", desafio: "0f8fad5b-d9cb-469f-a165-70867728950e", codigo: "000000" });
    expect(response.status).toBe(400);
    expect(body.erro).toContain("Restam 3");
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

  it("recusa origem desconhecida", async () => {
    const { response } = await call({ acao: "listar", sessao: SESSION }, "https://evil.example");
    expect(response.status).toBe(403);
  });
});

describe("portal-cliente: senha definida pelo operador", () => {
  it("entra com CPF/CNPJ + senha e devolve token cujo hash vai ao banco", async () => {
    const { response, body } = await call({ acao: "entrarSenha", documento: "11.222.333/0001-81", senha: "Ana-Senha-2026" });
    expect(response.status).toBe(200);
    expect(body.metodo).toBe("SENHA");
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

  it("detalhe informa o método da sessão", async () => {
    const { body } = await call({ acao: "detalhe", sessao: SESSION, equipamentoId: 28 });
    expect(body.metodo).toBe("SENHA");
  });
});
