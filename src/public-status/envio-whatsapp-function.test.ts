// @vitest-environment node

import { webcrypto } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE_URL = "https://sgaqvxubopgwysnyocjs.supabase.co";
const SECRET = "processor-secret-with-at-least-32-characters";
const PROVIDER_TOKEN = "provider-token-12345678";

type Handler = (request: Request) => Promise<Response> | Response;
let handler: Handler;

type Item = {
  tentativa_id: number;
  empresa_id: number;
  equipamento_id: number;
  tipo: string;
  mensagem_payload: Record<string, unknown> | null;
  valido: boolean;
};

let queue: Item[];
let config: Record<string, unknown> | null;
let providerReply: (url: string, init: RequestInit) => Response | Promise<Response>;
let calls: Array<{ name: string; args: Record<string, any> }>;
let providerCalls: Array<{ url: string; headers: Headers; body: any }>;
let concludeOk: boolean;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const item = (overrides: Partial<Item> = {}, payload: Record<string, unknown> = {}): Item => ({
  tentativa_id: 11,
  empresa_id: 3,
  equipamento_id: 28,
  tipo: "equipamento_pronto",
  valido: true,
  mensagem_payload: {
    template: "equipamento_pronto",
    parametros: ["Maria", "Zebra ZT230", ""],
    usaLink: false,
    texto: "Seu equipamento está PRONTO",
    contato: "5571999998888",
    ...payload,
  },
  ...overrides,
});

beforeAll(async () => {
  const environment: Record<string, string> = {
    SUPABASE_URL,
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "sb_secret_test_only" }),
    ENVIO_WHATSAPP_PROCESSOR_SECRET: SECRET,
    WHATSAPP_TOKENS: JSON.stringify({ "3": PROVIDER_TOKEN }),
  };
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", {
    env: { get: (name: string) => environment[name] },
    serve: (next: Handler) => { handler = next; },
  });
  await import("../../supabase/functions/envio-whatsapp/index.ts");
});

beforeEach(() => {
  queue = [];
  calls = [];
  providerCalls = [];
  concludeOk = true;
  config = { provedor: "EVOLUTION", evolution_api_url: "https://evolution.example/send", cloud_phone_number_id: null, cloud_idioma: null };
  providerReply = () => json({ key: { id: "MSG-1" } });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const rpc = url.pathname.split("/rpc/")[1];
    if (!rpc) {
      providerCalls.push({ url: url.toString(), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return providerReply(url.toString(), init ?? {});
    }
    const args = JSON.parse(String(init?.body));
    calls.push({ name: rpc, args });
    switch (rpc) {
      case "varrer_envios_whatsapp": return json([{ incertas: 1, expiradas: 2 }]);
      case "reservar_envios_whatsapp": return json(queue.length ? [queue.shift()] : []);
      case "obter_config_envio_whatsapp": return json(config ? [config] : []);
      case "concluir_envio_whatsapp": return json(concludeOk);
      default: return json({ message: "unexpected" }, 500);
    }
  }));
});

async function run(secret: string | null = SECRET, method = "POST") {
  const headers: Record<string, string> = {};
  if (secret) headers["x-processador-secret"] = secret;
  const response = await handler(new Request(`${SUPABASE_URL}/functions/v1/envio-whatsapp`, { method, headers, body: method === "POST" ? "{}" : undefined }));
  return { response, body: await response.json() as Record<string, any> };
}

const concluded = () => calls.filter((call) => call.name === "concluir_envio_whatsapp").map((call) => call.args);

describe("envio-whatsapp processor", () => {
  it("recusa chamadas sem o segredo do Cron e métodos diferentes de POST", async () => {
    expect((await run(null)).response.status).toBe(401);
    expect((await run("x".repeat(SECRET.length))).response.status).toBe(401);
    expect((await run(SECRET, "GET")).response.status).toBe(405);
    expect(calls).toEqual([]);
  });

  it("varre, reserva uma tentativa por vez e envia pela Evolution", async () => {
    queue = [item(), item({ tentativa_id: 12 })];
    const { response, body } = await run();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ reservadas: 2, enviadas: 2, varridasIncertas: 1, expiradas: 2 });
    expect(calls[0].name).toBe("varrer_envios_whatsapp");
    expect(calls.filter((call) => call.name === "reservar_envios_whatsapp").every((call) => call.args.p_limite === 1)).toBe(true);
    expect(providerCalls[0].url).toBe("https://evolution.example/send");
    expect(providerCalls[0].body).toMatchObject({ number: "5571999998888", text: "Seu equipamento está PRONTO" });
    expect(providerCalls[0].headers.get("apikey")).toBe(PROVIDER_TOKEN);
    expect(concluded()[0]).toMatchObject({ p_tentativa_id: 11, p_estado: "ENVIADA", p_provedor: "EVOLUTION", p_mensagem_externa_id: "MSG-1", p_erro: null });
    expect(new Set(concluded().map((args) => args.p_instancia)).size).toBe(1);
  });

  it("envia modelo pela Cloud API só com os parâmetros do corpo", async () => {
    config = { provedor: "CLOUD_API", evolution_api_url: null, cloud_phone_number_id: "1234567890", cloud_idioma: "pt_BR" };
    providerReply = () => json({ messages: [{ id: "wamid.ABC" }] });
    queue = [item({ tipo: "orcamento_informativo" }, {
      template: "orcamento_informativo",
      parametros: ["Maria", "Zebra ZT230", "R$ 250,00", "30/10/2026"],
      texto: "Orçamento pronto",
    })];
    const { body } = await run();

    expect(body.enviadas).toBe(1);
    const request = providerCalls[0];
    expect(request.url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");
    expect(request.headers.get("authorization")).toBe(`Bearer ${PROVIDER_TOKEN}`);
    expect(request.body).toEqual({
      messaging_product: "whatsapp",
      to: "5571999998888",
      type: "template",
      template: {
        name: "orcamento_informativo",
        language: { code: "pt_BR" },
        components: [
          { type: "body", parameters: ["Maria", "Zebra ZT230", "R$ 250,00", "30/10/2026"].map((text) => ({ type: "text", text })) },
        ],
      },
    });
    expect(concluded()[0]).toMatchObject({ p_estado: "ENVIADA", p_provedor: "CLOUD_API", p_mensagem_externa_id: "wamid.ABC" });
  });

  it("pedido antigo do link de decisão (descontinuado) falha sem chamar o provedor", async () => {
    queue = [item({ tipo: "orcamento_decisao" }, { usaLink: true, texto: "Link: https://status.bmitag.com.br/#/o/{{TOKEN}}" })];
    await run();

    expect(providerCalls).toEqual([]);
    expect(calls.some((call) => call.name === "emitir_link_decisao_envio")).toBe(false);
    expect(concluded()[0]).toMatchObject({ p_estado: "FALHOU" });
    expect(concluded()[0].p_erro).toMatch(/Portal do Cliente/);
  });

  it("preenche parâmetros vazios do modelo, que a Cloud API recusa", async () => {
    config = { provedor: "CLOUD_API", evolution_api_url: null, cloud_phone_number_id: "1", cloud_idioma: "pt_BR" };
    queue = [item()];
    await run();
    expect(providerCalls[0].body.template.components[0].parameters.at(-1)).toEqual({ type: "text", text: "-" });
  });

  it("classifica HTTP 5xx como incerta e HTTP 4xx como falha, sem vazar segredos", async () => {
    queue = [item({ tentativa_id: 21 }), item({ tentativa_id: 22 })];
    let count = 0;
    providerReply = () => (count++ === 0
      ? new Response(`bad gateway for ${PROVIDER_TOKEN} at https://evolution.example/send`, { status: 502 })
      : new Response("invalid number", { status: 400 }));
    const { body } = await run();

    expect(body).toMatchObject({ incertas: 1, falhas: 1, enviadas: 0 });
    const [first, second] = concluded();
    expect(first).toMatchObject({ p_tentativa_id: 21, p_estado: "INCERTA" });
    expect(first.p_erro).toContain("502");
    expect(first.p_erro).not.toContain(PROVIDER_TOKEN);
    expect(first.p_erro).not.toContain("evolution.example");
    expect(second).toMatchObject({ p_tentativa_id: 22, p_estado: "FALHOU" });
  });

  it("tempo esgotado é incerto; falha de conexão é definitiva", async () => {
    queue = [item({ tentativa_id: 31 }), item({ tentativa_id: 32 })];
    let count = 0;
    providerReply = () => {
      if (count++ === 0) throw new DOMException("timed out", "TimeoutError");
      throw new TypeError("error sending request: client error (Connect): tcp connect error");
    };
    await run();

    expect(concluded().map((args) => args.p_estado)).toEqual(["INCERTA", "FALHOU"]);
  });

  it("não envia quando o evento mudou, a empresa não é central ou falta o token", async () => {
    queue = [item({ tentativa_id: 41, valido: false }), item({ tentativa_id: 42 }), item({ tentativa_id: 43, empresa_id: 9 })];
    config = null;
    await run();
    expect(providerCalls).toEqual([]);
    expect(concluded().map((args) => args.p_estado)).toEqual(["FALHOU", "FALHOU", "FALHOU"]);

    config = { provedor: "EVOLUTION", evolution_api_url: "https://evolution.example/send", cloud_phone_number_id: null, cloud_idioma: null };
    calls = [];
    queue = [item({ tentativa_id: 44, empresa_id: 9 })];
    await run();
    expect(concluded()[0].p_erro).toMatch(/Token do provedor/);
    expect(providerCalls).toEqual([]);
  });

  it("tenta concluir de novo e, se não conseguir, não repete o envio", async () => {
    queue = [item()];
    let concludeCalls = 0;
    const original = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/rpc/concluir_envio_whatsapp")) {
        concludeCalls += 1;
        throw new TypeError("network down");
      }
      return original(input, init);
    }));
    const { body } = await run();

    expect(concludeCalls).toBe(3);
    expect(providerCalls).toHaveLength(1);
    expect(body.incertas).toBe(1);
  });

  it("nunca registra token do provedor nem telefone em log", async () => {
    const logs: string[] = [];
    for (const method of ["log", "warn", "error", "info"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { logs.push(args.join(" ")); });
    }
    concludeOk = false;
    providerReply = () => new Response(`erro ${PROVIDER_TOKEN} 5571999998888`, { status: 500 });
    queue = [item()];
    await run();

    const everything = logs.join("\n");
    expect(everything).not.toContain(PROVIDER_TOKEN);
    expect(everything).not.toContain("5571999998888");
  });
});
