// @vitest-environment node

import { createHash, webcrypto } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE_URL = "https://sgaqvxubopgwysnyocjs.supabase.co";
const PORTAL_ORIGIN = "https://status.bmitag.com.br";
const TOKEN = "cd".repeat(32);
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");

type Handler = (request: Request) => Promise<Response> | Response;
let handler: Handler;
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
let rpcReply: (name: string, args: Record<string, unknown>) => Response;
let allowedByRateLimit: boolean;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const rpcError = (message: string) => json({ code: "P0001", message }, 400);

beforeAll(async () => {
  const environment: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test_only" }),
    PUBLIC_STATUS_RATE_LIMIT_SECRET: "test-secret-value-with-at-least-32-characters",
    PUBLIC_STATUS_ORIGIN: PORTAL_ORIGIN,
  };
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => environment[name] },
    serve: (next: Handler) => { handler = next; },
  });
  await import("../../supabase/functions/orcamento-decisao/index.ts");
});

beforeEach(() => {
  rpcCalls = [];
  allowedByRateLimit = true;
  rpcReply = () => json({});
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const name = url.pathname.split("/rpc/")[1];
    if (!name) return json({ message: "unexpected request" }, 500);
    if (name === "consumir_limite_status_publico") return json(allowedByRateLimit);
    const args = JSON.parse(String(init?.body));
    rpcCalls.push({ name, args });
    return rpcReply(name, args);
  }));
});

async function call(body: Record<string, unknown>, extraHeaders: Record<string, string> = {}) {
  const response = await handler(new Request(`${SUPABASE_URL}/functions/v1/orcamento-decisao`, {
    method: "POST",
    headers: { origin: PORTAL_ORIGIN, "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  }));
  return { response, body: await response.json() as Record<string, unknown> };
}

describe("orcamento-decisao edge function", () => {
  it("consulta pelo hash do token e nunca envia o token ao banco", async () => {
    rpcReply = () => json({ estado: "ABERTO", valorTotal: 100 });
    const { response, body } = await call({ acao: "consultar", token: TOKEN });

    expect(response.status).toBe(200);
    expect(body.estado).toBe("ABERTO");
    expect(rpcCalls).toEqual([{ name: "consultar_orcamento_decisao", args: { p_token_hash: TOKEN_HASH } }]);
    expect(JSON.stringify(rpcCalls)).not.toContain(TOKEN);
  });

  it("registra a resposta com a resposta vigente que o cliente viu", async () => {
    rpcReply = () => json([{
      resposta_id: 7, decisao: "APROVAR", registrada_em: "2026-10-14T14:32:00Z",
      janela_ate: "2026-10-14T14:47:00Z", repetida: false,
    }]);
    const { response, body } = await call({ acao: "responder", token: TOKEN, decisao: "APROVAR", respostaVigenteId: 3 });

    expect(response.status).toBe(200);
    expect(body).toEqual({
      respostaId: 7, decisao: "APROVAR", registradaEm: "2026-10-14T14:32:00Z",
      janelaAte: "2026-10-14T14:47:00Z", repetida: false,
    });
    expect(rpcCalls[0]).toEqual({
      name: "registrar_resposta_orcamento",
      args: { p_token_hash: TOKEN_HASH, p_decisao: "APROVAR", p_resposta_vigente_id: 3 },
    });
  });

  it.each([
    ["LINK_INDISPONIVEL", 404], ["ACEITE_PAUSADO", 404],
    ["RESPOSTA_DESATUALIZADA", 409], ["RESPOSTA_JA_APLICADA", 409], ["NADA_A_DESFAZER", 409],
    ["LIMITE_SOLICITACOES", 429],
  ])("traduz %s em HTTP %i sem diferenciar link inexistente de pausado", async (code, status) => {
    rpcReply = () => rpcError(code);
    const { response, body } = await call({ acao: "responder", token: TOKEN, decisao: "RECUSAR" });
    expect(response.status).toBe(status);
    if (status === 404) expect(body).toEqual({ erro: "Orçamento indisponível." });
  });

  it("não vaza erros internos do banco", async () => {
    rpcReply = () => json({ code: "42501", message: 'permission denied for table "orcamento_respostas"' }, 403);
    const { response, body } = await call({ acao: "consultar", token: TOKEN });
    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain("orcamento_respostas");
  });

  it("recebe dúvida e pedido de mudança com limite de tamanho", async () => {
    rpcReply = () => json([{ solicitacao_id: 1, criado_em: "2026-10-14T15:00:00Z" }]);
    const ok = await call({ acao: "solicitar", token: TOKEN, tipo: "MUDANCA", mensagem: "  Quero cancelar  " });
    expect(ok.response.status).toBe(200);
    expect(rpcCalls[0].args).toEqual({ p_token_hash: TOKEN_HASH, p_tipo: "MUDANCA", p_mensagem: "Quero cancelar" });

    rpcCalls = [];
    for (const mensagem of ["", "x".repeat(501)]) {
      const bad = await call({ acao: "solicitar", token: TOKEN, tipo: "DUVIDA", mensagem });
      expect(bad.response.status).toBe(400);
    }
    expect(rpcCalls).toEqual([]);
  });

  it("rejeita parâmetros inválidos antes de consultar o banco", async () => {
    for (const body of [
      { acao: "responder", token: TOKEN, decisao: "TALVEZ" },
      { acao: "responder", token: TOKEN, decisao: "APROVAR", respostaVigenteId: -1 },
      { acao: "responder", token: TOKEN, decisao: "APROVAR", respostaVigenteId: "1" },
      { acao: "apagar", token: TOKEN },
    ]) {
      expect((await call(body)).response.status).toBe(400);
    }
    expect((await call({ acao: "consultar", token: "curto" })).response.status).toBe(404);
    expect(rpcCalls).toEqual([]);
  });

  it("aplica limite de consultas e bloqueia origem desconhecida", async () => {
    allowedByRateLimit = false;
    const limited = await call({ acao: "consultar", token: TOKEN }, { "cf-connecting-ip": "203.0.113.5" });
    expect(limited.response.status).toBe(429);
    expect(limited.response.headers.get("retry-after")).toBe("60");
    expect(rpcCalls).toEqual([]);

    allowedByRateLimit = true;
    const foreign = await call({ acao: "consultar", token: TOKEN }, { origin: "https://evil.example" });
    expect(foreign.response.status).toBe(403);
  });
});
