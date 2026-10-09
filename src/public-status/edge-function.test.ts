// @vitest-environment node

import { createHash, webcrypto } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const SUPABASE_URL = "https://sgaqvxubopgwysnyocjs.supabase.co";
const PORTAL_ORIGIN = "https://status.bmitag.com.br";
const TOKEN = "ab".repeat(32);
const TOKEN_HASH = createHash("sha256").update(TOKEN).digest("hex");
const NOW = Date.now();

type PublicStatusHandler = (request: Request) => Promise<Response> | Response;
type TestState = {
  enabled: boolean;
  links: Array<Record<string, unknown>>;
  equipment: Record<string, unknown>;
  allowedByRateLimit: boolean;
};

let handler: PublicStatusHandler;
let state: TestState;

const linkRow = (expiresAt = new Date(NOW + 60_000).toISOString()) => ({
  id: 15,
  equipamento_id: 28,
  empresa_id: 3,
  criado_em: new Date(NOW - 60_000).toISOString(),
  expira_em: expiresAt,
  revogado_em: null,
});

const equipmentRow = () => ({
  id: 28,
  empresa_id: 3,
  tipo: "Impressora",
  marca: "Zebra",
  modelo: "ZT230",
  status: "EM_VERIFICACAO",
  status_alterado_em: new Date(NOW - 30_000).toISOString(),
  serial_number: "SEGREDO-INTERNO",
  cliente_id: 999,
});

function mockResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

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
    serve: (nextHandler: PublicStatusHandler) => { handler = nextHandler; },
  });

  await import("../../supabase/functions/public-status/index.ts");
});

beforeEach(() => {
  state = {
    enabled: true,
    links: [linkRow()],
    equipment: equipmentRow(),
    allowedByRateLimit: true,
  };

  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";

    if (url.pathname.endsWith("/rpc/consumir_limite_status_publico")) {
      return mockResponse(state.allowedByRateLimit);
    }
    if (url.pathname.endsWith("/status_portal_config")) {
      return mockResponse([{ public_enabled: state.enabled }]);
    }
    if (url.pathname.endsWith("/links_status_publico") && method === "PATCH") {
      return mockResponse([{ id: 15 }]);
    }
    if (url.pathname.endsWith("/links_status_publico")) {
      return mockResponse(url.searchParams.get("token_hash") === `eq.${TOKEN_HASH}` ? state.links : []);
    }
    if (url.pathname.endsWith("/equipamentos")) {
      return mockResponse([state.equipment]);
    }

    return mockResponse({ message: "unexpected request" }, 500);
  }));
});

async function callPortal(token: string | null = TOKEN) {
  const response = await handler(new Request(`${SUPABASE_URL}/functions/v1/public-status`, {
    method: "POST",
    headers: { origin: PORTAL_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(token === null ? {} : { token }),
  }));
  return { response, body: await response.json() as Record<string, unknown> };
}

describe("public status edge function", () => {
  it("returns only customer-safe status fields for the matching tenant", async () => {
    const { response, body } = await callPortal();
    const fetchMock = vi.mocked(fetch);
    const equipmentRequest = fetchMock.mock.calls
      .map(([input]) => new URL(input instanceof Request ? input.url : input.toString()))
      .find((url) => url.pathname.endsWith("/equipamentos"));
    const tokenLookup = fetchMock.mock.calls
      .map(([input]) => new URL(input instanceof Request ? input.url : input.toString()))
      .find((url) => url.pathname.endsWith("/links_status_publico"));

    expect(response.status).toBe(200);
    expect(body).toEqual({
      equipamento: "Impressora Zebra ZT230",
      titulo: "Estamos analisando seu equipamento",
      orientacao: "A equipe técnica está verificando o que precisa ser feito.",
      statusAlteradoEm: state.equipment.status_alterado_em,
    });
    expect(equipmentRequest?.searchParams.get("empresa_id")).toBe("eq.3");
    expect(equipmentRequest?.searchParams.get("select")).toBe("id,empresa_id,tipo,marca,modelo,status,status_alterado_em");
    expect(tokenLookup?.searchParams.get("token_hash")).not.toBe(TOKEN);
    expect(JSON.stringify(body)).not.toContain("SEGREDO-INTERNO");
  });

  it("gives the same public response for missing, revoked, and expired links", async () => {
    const missing = await callPortal("cd".repeat(32));

    state.links = [];
    const revoked = await callPortal();

    state.links = [linkRow(new Date(NOW - 1_000).toISOString())];
    const expired = await callPortal();

    expect([missing.response.status, revoked.response.status, expired.response.status]).toEqual([404, 404, 404]);
    expect(missing.body).toEqual(revoked.body);
    expect(revoked.body).toEqual(expired.body);
  });

  it("keeps the portal unavailable while its global switch is off", async () => {
    state.enabled = false;
    const { response, body } = await callPortal();
    const fetchMock = vi.mocked(fetch);
    const linkLookups = fetchMock.mock.calls.filter(([input]) =>
      new URL(input instanceof Request ? input.url : input.toString()).pathname.endsWith("/links_status_publico"),
    );

    expect(response.status).toBe(404);
    expect(body).toEqual({ erro: "Acompanhamento indisponível." });
    expect(linkLookups).toHaveLength(0);
  });

  it.each([
    ["a entrega com mais de 30 dias", new Date(NOW - 31 * 24 * 60 * 60 * 1_000).toISOString()],
    ["a entrega sem data confiável", null],
  ])("does not reveal a delivered service after %s", async (_description, deliveredAt) => {
    state.equipment = { ...equipmentRow(), status: "ENTREGUE", status_alterado_em: deliveredAt };
    const { response, body } = await callPortal();

    expect(response.status).toBe(404);
    expect(body).toEqual({ erro: "Acompanhamento indisponível." });
  });

  it("rejects equipment rows whose company does not match the link", async () => {
    state.equipment = { ...equipmentRow(), empresa_id: 99 };
    const { response, body } = await callPortal();

    expect(response.status).toBe(404);
    expect(body).toEqual({ erro: "Acompanhamento indisponível." });
  });

  it("rate limits before looking up the capability token", async () => {
    state.allowedByRateLimit = false;
    const { response } = await callPortal();
    const fetchMock = vi.mocked(fetch);
    const linkLookups = fetchMock.mock.calls.filter(([input]) =>
      new URL(input instanceof Request ? input.url : input.toString()).pathname.endsWith("/links_status_publico"),
    );

    expect(response.status).toBe(429);
    expect(linkLookups).toHaveLength(0);
  });

  it("does not spend any shared rate-limit bucket on malformed tokens", async () => {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const { response } = await callPortal("abc");
      expect(response.status).toBe(404);
    }
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();

    const { response } = await callPortal();
    expect(response.status).toBe(200);
  });

  it("does not use client-supplied IP headers as a rate-limit identity", async () => {
    const headers = { origin: PORTAL_ORIGIN, "content-type": "application/json", "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" };
    await handler(new Request(`${SUPABASE_URL}/functions/v1/public-status`, { method: "POST", headers, body: JSON.stringify({ token: TOKEN }) }));
    const firstFingerprints = vi.mocked(fetch).mock.calls
      .filter(([input]) => new URL(input instanceof Request ? input.url : input.toString()).pathname.endsWith("/rpc/consumir_limite_status_publico"))
      .map(([, init]) => JSON.parse(String(init?.body)).p_fingerprint);

    vi.mocked(fetch).mockClear();
    await handler(new Request(`${SUPABASE_URL}/functions/v1/public-status`, {
      method: "POST", headers: { ...headers, "x-real-ip": "9.9.9.9", "x-forwarded-for": "8.8.8.8" }, body: JSON.stringify({ token: TOKEN }),
    }));
    const secondFingerprints = vi.mocked(fetch).mock.calls
      .filter(([input]) => new URL(input instanceof Request ? input.url : input.toString()).pathname.endsWith("/rpc/consumir_limite_status_publico"))
      .map(([, init]) => JSON.parse(String(init?.body)).p_fingerprint);

    expect(firstFingerprints).toHaveLength(2);
    expect(firstFingerprints).toEqual(secondFingerprints);
  });

  it("separates client buckets using the gateway IP", async () => {
    const headers = { origin: PORTAL_ORIGIN, "content-type": "application/json", "cf-connecting-ip": "203.0.113.10" };
    await handler(new Request(`${SUPABASE_URL}/functions/v1/public-status`, { method: "POST", headers, body: JSON.stringify({ token: TOKEN }) }));
    const firstFingerprints = vi.mocked(fetch).mock.calls
      .filter(([input]) => new URL(input instanceof Request ? input.url : input.toString()).pathname.endsWith("/rpc/consumir_limite_status_publico"))
      .map(([, init]) => JSON.parse(String(init?.body)).p_fingerprint);

    vi.mocked(fetch).mockClear();
    await handler(new Request(`${SUPABASE_URL}/functions/v1/public-status`, {
      method: "POST", headers: { ...headers, "cf-connecting-ip": "203.0.113.11" }, body: JSON.stringify({ token: TOKEN }),
    }));
    const secondFingerprints = vi.mocked(fetch).mock.calls
      .filter(([input]) => new URL(input instanceof Request ? input.url : input.toString()).pathname.endsWith("/rpc/consumir_limite_status_publico"))
      .map(([, init]) => JSON.parse(String(init?.body)).p_fingerprint);

    expect(firstFingerprints).toHaveLength(2);
    expect(firstFingerprints[0]).not.toBe(secondFingerprints[0]);
    expect(firstFingerprints[1]).toBe(secondFingerprints[1]);
  });

  it("rejects local browser origins unless explicitly enabled", async () => {
    const response = await handler(new Request(`${SUPABASE_URL}/functions/v1/public-status`, {
      method: "OPTIONS", headers: { origin: "http://localhost:1420" },
    }));
    expect(response.status).toBe(403);
  });
});
