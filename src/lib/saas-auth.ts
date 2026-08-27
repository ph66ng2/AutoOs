import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { tauriSaasSessionStore, type SaasSessionStore } from "@/lib/saas-session-store";
import {
  SaasAuthError,
  type SaasAuthService,
  type SaasIdentity,
  type SaasRestoreResult,
  type SaasSession,
  type SaasSignOutResult,
} from "@/types/saas-auth";

const SESSION_REFRESH_MARGIN_SECONDS = 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface SaasAuthConfiguration {
  supabaseUrl: string;
  publishableKey: string;
  passwordRecoveryRedirect: string;
}

interface AuthResult {
  session: Session | null;
  error: unknown;
}

export interface SaasSupabaseAuthPort {
  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  setSession(accessToken: string, refreshToken: string): Promise<AuthResult>;
  refreshSession(refreshToken: string): Promise<AuthResult>;
  getClaims(accessToken: string): Promise<{ claims: Record<string, unknown> | null; error: unknown }>;
  signOutLocal(accessToken: string, refreshToken: string): Promise<{ error: unknown }>;
  resetPasswordForEmail(email: string, redirectTo: string): Promise<{ error: unknown }>;
}

type Environment = Record<string, string | boolean | undefined>;

function requireHttpsUrl(value: string | undefined, field: string): string {
  const configured = value?.trim();
  if (!configured) throw new SaasAuthError("configuration", `${field} não foi configurado.`);
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("invalid");
    return configured;
  } catch {
    throw new SaasAuthError("configuration", `${field} deve ser uma URL HTTPS válida.`);
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function validatePublishableKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key) throw new SaasAuthError("configuration", "VITE_SUPABASE_PUBLISHABLE_KEY não foi configurada.");
  const role = decodeJwtPayload(key)?.role;
  if (key.startsWith("sb_secret_") || role === "service_role") {
    throw new SaasAuthError("configuration", "A aplicação aceita somente uma chave publicável do Supabase.");
  }
  return key;
}

export function loadSaasAuthConfiguration(environment: Environment): SaasAuthConfiguration {
  return {
    supabaseUrl: requireHttpsUrl(
      environment.VITE_SUPABASE_URL as string | undefined,
      "VITE_SUPABASE_URL",
    ).replace(/\/+$/, ""),
    publishableKey: validatePublishableKey(environment.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined),
    passwordRecoveryRedirect: requireHttpsUrl(
      environment.VITE_SUPABASE_PASSWORD_RECOVERY_REDIRECT as string | undefined,
      "VITE_SUPABASE_PASSWORD_RECOVERY_REDIRECT",
    ),
  };
}

function createAuthClient(config: SaasAuthConfiguration): SupabaseClient {
  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export class SupabaseSaasAuthPort implements SaasSupabaseAuthPort {
  constructor(private readonly config: SaasAuthConfiguration) {}

  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await createAuthClient(this.config).auth.signInWithPassword({ email, password });
    return { session: data.session, error };
  }

  async setSession(accessToken: string, refreshToken: string): Promise<AuthResult> {
    const { data, error } = await createAuthClient(this.config).auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { session: data.session, error };
  }

  async refreshSession(refreshToken: string): Promise<AuthResult> {
    const { data, error } = await createAuthClient(this.config).auth.refreshSession({ refresh_token: refreshToken });
    return { session: data.session, error };
  }

  async getClaims(accessToken: string) {
    const { data, error } = await createAuthClient(this.config).auth.getClaims(accessToken);
    return { claims: (data?.claims as Record<string, unknown> | undefined) ?? null, error };
  }

  async signOutLocal(accessToken: string, refreshToken: string) {
    const client = createAuthClient(this.config);
    const restored = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (restored.error) return { error: restored.error };
    return client.auth.signOut({ scope: "local" });
  }

  async resetPasswordForEmail(email: string, redirectTo: string) {
    return createAuthClient(this.config).auth.resetPasswordForEmail(email, { redirectTo });
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) return String(error.message);
  return String(error ?? "");
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const status = Number(error.status);
  return Number.isFinite(status) ? status : undefined;
}

function isNetworkError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return error instanceof TypeError || /failed to fetch|network|offline|load failed|connection|timeout/.test(message);
}

function isInvalidCredentialError(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorMessage(error).toLowerCase();
  return status === 400 || status === 401 || /invalid login credentials|email not confirmed/.test(message);
}

function isExpiredSessionError(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorMessage(error).toLowerCase();
  return status === 401 || /refresh token|jwt expired|session.*expired|invalid.*token/.test(message);
}

function requireUuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new SaasAuthError("invalid_claims", `A sessão não contém um ${label} válido.`);
  }
  return value;
}

function getObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

async function normalizeSession(port: SaasSupabaseAuthPort, session: Session): Promise<SaasSession> {
  if (!session.access_token || !session.refresh_token || !session.expires_at) {
    throw new SaasAuthError("expired", "A sessão recebida está incompleta.");
  }

  const verified = await port.getClaims(session.access_token);
  if (verified.error || !verified.claims) {
    if (isNetworkError(verified.error)) throw new SaasAuthError("network", "Não foi possível validar a sessão agora.");
    throw new SaasAuthError("invalid_claims", "A identidade da sessão não pôde ser validada.");
  }

  const claims = verified.claims;
  const appMetadata = getObject(claims.app_metadata);
  const userId = requireUuid(claims.sub, "UUID de usuário");
  if (session.user?.id && session.user.id !== userId) {
    throw new SaasAuthError("invalid_claims", "A identidade da sessão não corresponde ao usuário autenticado.");
  }
  if (appMetadata.profile_role !== "ADMIN") {
    throw new SaasAuthError("account_unavailable", "Esta conta não possui um perfil administrador ativo no AutoOS.");
  }

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    throw new SaasAuthError("invalid_claims", "A sessão não contém um email válido.");
  }

  const identity: SaasIdentity = {
    userId,
    companyId: requireUuid(appMetadata.company_id, "UUID de empresa"),
    profileId: requireUuid(appMetadata.profile_id, "UUID de perfil"),
    email,
  };
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at,
    identity,
  };
}

function expired(message = "Sua sessão expirou. Entre novamente para continuar.", email?: string): SaasRestoreResult {
  return { kind: "expired", message, email };
}

export class DefaultSaasAuthService implements SaasAuthService {
  constructor(
    private readonly port: SaasSupabaseAuthPort,
    private readonly store: SaasSessionStore,
    private readonly recoveryRedirect: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async persist(session: Session): Promise<SaasSession> {
    const normalized = await normalizeSession(this.port, session);
    try {
      await this.store.save(normalized);
    } catch {
      throw new SaasAuthError("keyring", "Não foi possível proteger a sessão no cofre do sistema.");
    }
    return normalized;
  }

  async login(email: string, password: string): Promise<SaasSession> {
    let result: AuthResult;
    try {
      result = await this.port.signInWithPassword(email.trim().toLowerCase(), password);
    } catch (error) {
      if (isNetworkError(error)) throw new SaasAuthError("network", "Sem conexão com o serviço de autenticação.");
      throw new SaasAuthError("invalid_credentials", "Não foi possível entrar. Confira email e senha.");
    }
    if (result.error || !result.session) {
      if (isNetworkError(result.error)) throw new SaasAuthError("network", "Sem conexão com o serviço de autenticação.");
      if (isInvalidCredentialError(result.error)) {
        throw new SaasAuthError("invalid_credentials", "Email ou senha inválidos.");
      }
      throw new SaasAuthError("account_unavailable", "Esta conta não está disponível para acesso ao AutoOS.");
    }
    return this.persist(result.session);
  }

  async restoreSession(): Promise<SaasRestoreResult> {
    let stored: SaasSession | null;
    try {
      stored = await this.store.load();
    } catch {
      throw new SaasAuthError("keyring", "Não foi possível acessar a sessão protegida do sistema.");
    }
    if (!stored) return { kind: "signed_out" };
    return this.restoreStoredSession(stored);
  }

  async refreshSession(session: SaasSession): Promise<SaasRestoreResult> {
    return this.refreshStoredSession(session);
  }

  private async restoreStoredSession(stored: SaasSession): Promise<SaasRestoreResult> {
    const expiresSoon = stored.expiresAt <= Math.floor(this.now() / 1000) + SESSION_REFRESH_MARGIN_SECONDS;
    if (expiresSoon) return this.refreshStoredSession(stored);

    try {
      const result = await this.port.setSession(stored.accessToken, stored.refreshToken);
      if (result.error || !result.session) return this.restoreFailure(stored, result.error);
      return { kind: "authenticated", session: await this.persist(result.session) };
    } catch (error) {
      if (error instanceof SaasAuthError && error.code === "keyring") throw error;
      return this.restoreFailure(stored, error);
    }
  }

  private async refreshStoredSession(stored: SaasSession): Promise<SaasRestoreResult> {
    try {
      const result = await this.port.refreshSession(stored.refreshToken);
      if (result.error || !result.session) return this.restoreFailure(stored, result.error);
      return { kind: "authenticated", session: await this.persist(result.session) };
    } catch (error) {
      if (error instanceof SaasAuthError && error.code === "keyring") throw error;
      return this.restoreFailure(stored, error);
    }
  }

  private async restoreFailure(stored: SaasSession, error: unknown): Promise<SaasRestoreResult> {
    if (isNetworkError(error) || (error instanceof SaasAuthError && error.code === "network")) {
      return {
        kind: "offline_recoverable",
        session: stored,
        message: "Sem conexão. A sessão protegida foi preservada; tente novamente quando estiver online.",
      };
    }
    if (isExpiredSessionError(error) || error instanceof SaasAuthError) {
      await this.clearStoredSession();
      return expired(undefined, stored.identity.email);
    }
    await this.clearStoredSession();
    return expired("Não foi possível restaurar a sessão. Entre novamente.", stored.identity.email);
  }

  async lock(): Promise<void> {
    // O provider remove a sessão da memória. O keyring permanece para desbloqueio futuro.
  }

  async signOut(session?: SaasSession): Promise<SaasSignOutResult> {
    let revoked = true;
    if (session) {
      try {
        const result = await this.port.signOutLocal(session.accessToken, session.refreshToken);
        revoked = !result.error;
      } catch {
        revoked = false;
      }
    }
    await this.clearStoredSession();
    return { revoked };
  }

  async requestPasswordRecovery(email: string): Promise<void> {
    try {
      const result = await this.port.resetPasswordForEmail(email.trim().toLowerCase(), this.recoveryRedirect);
      if (result.error && isNetworkError(result.error)) {
        throw new SaasAuthError("network", "Sem conexão para solicitar a redefinição de senha.");
      }
      if (result.error) throw new SaasAuthError("account_unavailable", "Não foi possível enviar a recuperação agora.");
    } catch (error) {
      if (error instanceof SaasAuthError) throw error;
      if (isNetworkError(error)) throw new SaasAuthError("network", "Sem conexão para solicitar a redefinição de senha.");
      throw new SaasAuthError("account_unavailable", "Não foi possível enviar a recuperação agora.");
    }
  }

  private async clearStoredSession(): Promise<void> {
    try {
      await this.store.clear();
    } catch {
      throw new SaasAuthError("keyring", "Não foi possível remover a sessão protegida do sistema.");
    }
  }
}

export function createSaasAuthService(environment: Environment = import.meta.env): SaasAuthService {
  const config = loadSaasAuthConfiguration(environment);
  return new DefaultSaasAuthService(
    new SupabaseSaasAuthPort(config),
    tauriSaasSessionStore,
    config.passwordRecoveryRedirect,
  );
}
