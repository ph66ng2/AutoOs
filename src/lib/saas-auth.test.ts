import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import {
  DefaultSaasAuthService,
  loadSaasAuthConfiguration,
  type SaasSupabaseAuthPort,
} from "@/lib/saas-auth";
import type { SaasSessionStore } from "@/lib/saas-session-store";
import { SaasAuthError, type SaasSession } from "@/types/saas-auth";

const USER_ID = "a0000000-0000-4000-8000-000000000001";
const COMPANY_ID = "b0000000-0000-4000-8000-000000000001";
const PROFILE_ID = "c0000000-0000-4000-8000-000000000001";

function supabaseSession(access = "access-new", refresh = "refresh-new", expiresAt = 1_900_000_000): Session {
  return {
    access_token: access,
    refresh_token: refresh,
    expires_at: expiresAt,
    expires_in: 3600,
    token_type: "bearer",
    user: { id: USER_ID, email: "Admin@Example.com" },
  } as Session;
}

function storedSession(): SaasSession {
  return {
    accessToken: "access-old",
    refreshToken: "refresh-old",
    expiresAt: 1_900_000_000,
    identity: { userId: USER_ID, companyId: COMPANY_ID, profileId: PROFILE_ID, email: "admin@example.com" },
  };
}

function harness(initial: SaasSession | null = null) {
  let stored = initial;
  const port: SaasSupabaseAuthPort = {
    signInWithPassword: vi.fn().mockResolvedValue({ session: supabaseSession(), error: null }),
    setSession: vi.fn().mockResolvedValue({ session: supabaseSession(), error: null }),
    refreshSession: vi.fn().mockResolvedValue({ session: supabaseSession(), error: null }),
    getClaims: vi.fn().mockResolvedValue({
      claims: {
        sub: USER_ID,
        email: "Admin@Example.com",
        app_metadata: { company_id: COMPANY_ID, profile_id: PROFILE_ID, profile_role: "ADMIN" },
      },
      error: null,
    }),
    signOutLocal: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
  };
  const store: SaasSessionStore = {
    load: vi.fn(async () => stored),
    save: vi.fn(async (session) => { stored = session; }),
    clear: vi.fn(async () => { stored = null; }),
  };
  return {
    port,
    store,
    service: new DefaultSaasAuthService(port, store, "https://app.autoos.com.br/auth/recovery", () => 1_800_000_000_000),
  };
}

describe("DefaultSaasAuthService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("recusa configuração HTTP e chave administrativa", () => {
    expect(() => loadSaasAuthConfiguration({
      VITE_SUPABASE_URL: "http://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      VITE_SUPABASE_PASSWORD_RECOVERY_REDIRECT: "https://app.autoos.com.br/auth/recovery",
    })).toThrow(SaasAuthError);
    expect(() => loadSaasAuthConfiguration({
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_forbidden",
      VITE_SUPABASE_PASSWORD_RECOVERY_REDIRECT: "https://app.autoos.com.br/auth/recovery",
    })).toThrow(/somente uma chave publicável/);
  });

  it("autentica por email/senha, valida claims autoritativas e salva só a sessão mínima", async () => {
    const { service, port, store } = harness();
    const session = await service.login(" Admin@Example.com ", "password-not-persisted");
    expect(port.signInWithPassword).toHaveBeenCalledWith("admin@example.com", "password-not-persisted");
    expect(port.getClaims).toHaveBeenCalledWith("access-new");
    expect(session.identity).toEqual({ userId: USER_ID, companyId: COMPANY_ID, profileId: PROFILE_ID, email: "admin@example.com" });
    expect(store.save).toHaveBeenCalledWith(session);
    expect(JSON.stringify(session)).not.toContain("password-not-persisted");
  });

  it("recusa sessão quando perfil não é ADMIN", async () => {
    const { service, port, store } = harness();
    vi.mocked(port.getClaims).mockResolvedValue({
      claims: { sub: USER_ID, email: "admin@example.com", app_metadata: { company_id: COMPANY_ID, profile_id: PROFILE_ID, profile_role: "CUSTOM" } },
      error: null,
    });
    await expect(service.login("admin@example.com", "password")).rejects.toMatchObject({ code: "account_unavailable" });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("não libera o app com senha incorreta", async () => {
    const { service, port, store } = harness();
    vi.mocked(port.signInWithPassword).mockResolvedValue({
      session: null,
      error: { status: 400, message: "Invalid login credentials" },
    });
    await expect(service.login("admin@example.com", "wrong-password")).rejects.toMatchObject({
      code: "invalid_credentials",
    });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("trata uma conta suspensa como indisponível sem revelar detalhes", async () => {
    const { service, port, store } = harness();
    vi.mocked(port.signInWithPassword).mockResolvedValue({
      session: null,
      error: { status: 403, message: "AutoOS account is not authorized" },
    });
    await expect(service.login("admin@example.com", "password")).rejects.toMatchObject({
      code: "account_unavailable",
    });
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rotaciona access e refresh tokens em um único save", async () => {
    const oldSession = storedSession();
    oldSession.expiresAt = 1_700_000_000;
    const { service, port, store } = harness(oldSession);
    const result = await service.restoreSession();
    expect(port.refreshSession).toHaveBeenCalledWith("refresh-old");
    expect(store.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ kind: "authenticated", session: { accessToken: "access-new", refreshToken: "refresh-new" } });
  });

  it("preserva o keyring quando a rede falha durante o restore", async () => {
    const { service, port, store } = harness(storedSession());
    vi.mocked(port.setSession).mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await service.restoreSession();
    expect(result).toMatchObject({ kind: "offline_recoverable", session: { refreshToken: "refresh-old" } });
    expect(store.clear).not.toHaveBeenCalled();
  });

  it("remove sessão inválida e exige novo login", async () => {
    const { service, port, store } = harness(storedSession());
    vi.mocked(port.setSession).mockResolvedValue({ session: null, error: { status: 401, message: "Invalid Refresh Token" } });
    const result = await service.restoreSession();
    expect(result.kind).toBe("expired");
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it("faz sign-out local e sempre limpa o keyring", async () => {
    const current = storedSession();
    const { service, port, store } = harness(current);
    await expect(service.signOut(current)).resolves.toEqual({ revoked: true });
    expect(port.signOutLocal).toHaveBeenCalledWith("access-old", "refresh-old");
    expect(store.clear).toHaveBeenCalledTimes(1);
  });

  it("usa exatamente o redirect HTTPS configurado na recuperação", async () => {
    const { service, port } = harness();
    await service.requestPasswordRecovery(" Admin@Example.com ");
    expect(port.resetPasswordForEmail).toHaveBeenCalledWith("admin@example.com", "https://app.autoos.com.br/auth/recovery");
  });
});
