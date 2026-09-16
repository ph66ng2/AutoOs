import { describe, expect, it, vi } from "vitest";
import type { Cliente } from "@/types";
import type { SaasSession } from "@/types/saas-auth";
import type { SaasAuthConfiguration } from "@/lib/saas-auth";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import {
  OnlineDataError,
  sessionFromSaasSession,
  SupabaseClientesRepository,
} from "@/lib/data/clientes-repository";

const companyId = "11111111-1111-4111-8111-111111111111";
const configuration: SaasAuthConfiguration = {
  supabaseUrl: "https://staging.example.supabase.co",
  publishableKey: "sb_publishable_test",
  passwordRecoveryRedirect: "https://example.com/auth/recovery",
};

function token(claims: Record<string, unknown>) {
  return `header.${btoa(JSON.stringify(claims)).replace(/=/g, "")}.signature`;
}

function session(): SaasSession {
  return {
    accessToken: token({ sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
    refreshToken: "refresh-token",
    expiresAt: 1_900_000_000,
    identity: {
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      companyId,
      profileId: "33333333-3333-4333-8333-333333333333",
      email: "admin@example.com",
    },
  };
}

describe("SupabaseClientesRepository", () => {
  it("deriva empresa_id da identidade SaaS já validada", async () => {
    const onlineSession = sessionFromSaasSession(session(), configuration);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ id: companyId, nome: "Ana", telefone: "11" }]), { status: 201 }));
    const repository = new SupabaseClientesRepository(onlineSession, fetcher);

    await repository.criar({ nome: "Ana", telefone: "11", ativo: true });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://staging.example.supabase.co/rest/v1/clientes");
    expect(init?.headers).toMatchObject({ apikey: "sb_publishable_test", Authorization: expect.stringContaining("Bearer ") });
    expect(JSON.parse(String(init?.body))).toMatchObject({ nome: "Ana", empresa_id: companyId });
  });

  it("converte sessão expirada e falta de rede em erros recuperáveis", async () => {
    const onlineSession = sessionFromSaasSession(session(), configuration);
    const expired = new SupabaseClientesRepository(onlineSession, vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 401 })));
    await expect(expired.listar()).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "SESSION_EXPIRED" });

    const offline = new SupabaseClientesRepository(onlineSession, vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network down")));
    await expect(offline.criar({ nome: "Ana", telefone: "11" })).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "ONLINE_UNAVAILABLE" });
  });

  it("recusa sessão SaaS sem empresa UUID válida", () => {
    expect(() => sessionFromSaasSession({ ...session(), identity: { ...session().identity, companyId: "invalid" } }, configuration)).toThrow(/identidade de empresa/i);
  });

  it("nunca envia empresa_id livre em updates", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ id: companyId, nome: "Ana", telefone: "11" } satisfies Cliente]), { status: 200 }));
    const repository = new SupabaseClientesRepository(sessionFromSaasSession(session(), configuration), fetcher);
    await repository.atualizar(companyId, { nome: "Ana", telefone: "11" });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).not.toHaveProperty("empresa_id");
  });
});
