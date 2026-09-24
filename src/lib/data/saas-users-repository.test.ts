import { describe, expect, it, vi } from "vitest";
import { createSaasUsersRepository, SaasUserAdminError } from "@/lib/data/saas-users-repository";
import type { SaasAuthConfiguration } from "@/lib/saas-auth";
import type { SaasSession } from "@/types/saas-auth";

const configuration: SaasAuthConfiguration = {
  supabaseUrl: "https://project.example.test",
  publishableKey: "sb_publishable_test",
  passwordRecoveryRedirect: "https://app.example.test/auth/recovery",
};

const session: SaasSession = {
  accessToken: "user-jwt-test",
  refreshToken: "refresh-token-test",
  expiresAt: 1_900_000_000,
  identity: {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    companyId: "a0000000-0000-4000-8000-000000000001",
    profileId: "a0000000-0000-4000-8000-000000000011",
    email: "admin@example.test",
  },
  profile: { id: "a0000000-0000-4000-8000-000000000011", name: "ADMIN", role: "ADMIN", permissions: [] },
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("SupabaseSaasUsersRepository", () => {
  it("calls the authenticated server boundary without sending tenant or role authority", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ status: "pending", userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }));
    const repository = createSaasUsersRepository(session, configuration, fetcher);

    await repository.invite("employee@example.test", "a0000000-0000-4000-8000-000000000014");

    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://project.example.test/functions/v1/saas-user-admin");
    expect(init?.headers).toMatchObject({ apikey: "sb_publishable_test", Authorization: "Bearer user-jwt-test" });
    expect(JSON.parse(String(init?.body))).toEqual({
      action: "invite",
      email: "employee@example.test",
      profileId: "a0000000-0000-4000-8000-000000000014",
    });
    expect(String(init?.body)).not.toContain("empresa_id");
    expect(String(init?.body)).not.toContain("ADMIN");
  });

  it("parses the server-scoped team list", async () => {
    const user = {
      user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      email: "employee@example.test",
      profile_id: "a0000000-0000-4000-8000-000000000014",
      profile_name: "Técnico",
      profile_role: "TECNICO",
      profile_active: true,
      status: "pending",
      legacy_admin: false,
      invited_at: "2026-09-23T12:00:00Z",
      updated_at: "2026-09-23T12:00:00Z",
    };
    const repository = createSaasUsersRepository(session, configuration, vi.fn<typeof fetch>().mockResolvedValue(response({ users: [user] })));

    await expect(repository.listUsers()).resolves.toEqual([user]);
  });

  it("loads active profiles through the session-scoped SECURITY INVOKER RPC without a tenant payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([{
      profile_id: "a0000000-0000-4000-8000-000000000014",
      nome: "Técnico",
      role: "TECNICO",
      permissions: ["CLIENTS_READ"],
    }]));
    const repository = createSaasUsersRepository(session, configuration, fetcher);

    await expect(repository.listActiveProfiles()).resolves.toEqual([{
      id: "a0000000-0000-4000-8000-000000000014",
      name: "Técnico",
      role: "TECNICO",
      permissions: ["CLIENTS_READ"],
    }]);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://project.example.test/rest/v1/rpc/list_active_saas_operational_profiles");
    expect(init?.headers).toMatchObject({ apikey: "sb_publishable_test", Authorization: "Bearer user-jwt-test" });
    expect(JSON.parse(String(init?.body))).toEqual({});
    expect(String(init?.body)).not.toContain(session.identity.companyId);
  });

  it("rejects malformed profile options", async () => {
    const repository = createSaasUsersRepository(session, configuration, vi.fn<typeof fetch>().mockResolvedValue(response([{
      profile_id: "not-a-uuid",
      nome: "Técnico",
      role: "TECNICO",
      permissions: [],
    }])));

    await expect(repository.listActiveProfiles()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([
    [401, "SESSION_EXPIRED"],
    [403, "FORBIDDEN"],
    [409, "CONFLICT"],
    [500, "ONLINE_UNAVAILABLE"],
  ] as const)("maps HTTP %s to a safe UI error", async (status, code) => {
    const repository = createSaasUsersRepository(session, configuration, vi.fn<typeof fetch>().mockResolvedValue(response({ error: "provider secret" }, status)));

    await expect(repository.listUsers()).rejects.toMatchObject({ code });
    await expect(repository.listUsers()).rejects.not.toThrow("provider secret");
  });

  it("maps an authorization conflict to an actionable safe message", async () => {
    const repository = createSaasUsersRepository(session, configuration, vi.fn<typeof fetch>().mockResolvedValue(response({ error: "provider detail" }, 409)));

    await expect(repository.deactivate("cccccccc-cccc-4ccc-8ccc-cccccccccccc")).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("conflita com o estado atual"),
    });
  });

  it("does not expose transport failures", async () => {
    const repository = createSaasUsersRepository(session, configuration, vi.fn<typeof fetch>().mockRejectedValue(new Error("token=private")));

    await expect(repository.listUsers()).rejects.toEqual(expect.objectContaining({
      code: "ONLINE_UNAVAILABLE",
      message: "A comunicação com o serviço de equipe falhou. Tente novamente.",
    }));
  });

  it("rejects malformed team data", async () => {
    const repository = createSaasUsersRepository(session, configuration, vi.fn<typeof fetch>().mockResolvedValue(response({ users: [{ email: "incomplete@example.test" }] })));

    await expect(repository.listUsers()).rejects.toBeInstanceOf(SaasUserAdminError);
  });
});
