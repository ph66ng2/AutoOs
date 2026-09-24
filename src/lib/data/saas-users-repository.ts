import { loadSaasAuthConfiguration, type SaasAuthConfiguration } from "@/lib/saas-auth";
import { sessionFromSaasSession, type SupabaseOnlineSession } from "@/lib/data/clientes-repository";
import type { SaasSession } from "@/types/saas-auth";

export type SaasCompanyUserStatus = "pending" | "active" | "inactive";

export interface SaasCompanyUser {
  user_id: string;
  email: string;
  profile_id: string;
  profile_name: string;
  profile_role: string;
  profile_active: boolean;
  status: SaasCompanyUserStatus;
  legacy_admin: boolean;
  invited_at: string | null;
  updated_at: string | null;
}

export interface SaasUserInviteResult {
  status: "pending";
  userId: string;
  resent?: boolean;
}

export type SaasUserAdminErrorCode = "SESSION_EXPIRED" | "FORBIDDEN" | "CONFLICT" | "ONLINE_UNAVAILABLE" | "INVALID_RESPONSE";

export class SaasUserAdminError extends Error {
  constructor(public readonly code: SaasUserAdminErrorCode, message: string) {
    super(message);
    this.name = "SaasUserAdminError";
  }
}

type FetchLike = typeof fetch;
type UserAdminAction =
  | { action: "list_users" }
  | { action: "invite"; email: string; profileId: string }
  | { action: "resend_invite"; targetUserId: string }
  | { action: "change_profile"; targetUserId: string; profileId: string }
  | { action: "deactivate" | "reactivate"; targetUserId: string }
  | { action: "accept_invite" };

function asFailure(response: Response): SaasUserAdminError {
  if (response.status === 401) {
    return new SaasUserAdminError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
  }
  if (response.status === 403) {
    return new SaasUserAdminError("FORBIDDEN", "Sua conta não está autorizada a realizar esta operação.");
  }
  if (response.status === 409) {
    return new SaasUserAdminError("CONFLICT", "A operação conflita com o estado atual do usuário.");
  }
  return new SaasUserAdminError("ONLINE_UNAVAILABLE", "Não foi possível concluir a operação online. Tente novamente.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseCompanyUsers(payload: unknown): SaasCompanyUser[] {
  if (!isRecord(payload) || !Array.isArray(payload.users)) {
    throw new SaasUserAdminError("INVALID_RESPONSE", "O serviço de equipe retornou uma resposta inválida.");
  }
  const validStatuses = new Set<SaasCompanyUserStatus>(["pending", "active", "inactive"]);
  if (payload.users.some((user) => !isRecord(user)
    || typeof user.user_id !== "string"
    || typeof user.email !== "string"
    || typeof user.profile_id !== "string"
    || typeof user.profile_name !== "string"
    || typeof user.profile_role !== "string"
    || typeof user.profile_active !== "boolean"
    || !validStatuses.has(user.status as SaasCompanyUserStatus)
    || typeof user.legacy_admin !== "boolean")) {
    throw new SaasUserAdminError("INVALID_RESPONSE", "O serviço de equipe retornou dados incompletos.");
  }
  return payload.users as SaasCompanyUser[];
}

export class SupabaseSaasUsersRepository {
  private readonly endpoint: string;

  constructor(
    private readonly session: SupabaseOnlineSession,
    private readonly fetcher: FetchLike = fetch.bind(globalThis),
  ) {
    this.endpoint = `${session.supabaseUrl}/functions/v1/saas-user-admin`;
  }

  private async request<T>(action: UserAdminAction): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          apikey: this.session.publishableKey,
          Authorization: `Bearer ${this.session.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(action),
      });
    } catch {
      throw new SaasUserAdminError("ONLINE_UNAVAILABLE", "A comunicação com o serviço de equipe falhou. Tente novamente.");
    }

    if (!response.ok) throw asFailure(response);
    try {
      return await response.json() as T;
    } catch {
      throw new SaasUserAdminError("INVALID_RESPONSE", "O serviço de equipe retornou uma resposta inválida.");
    }
  }

  async listUsers(): Promise<SaasCompanyUser[]> {
    return parseCompanyUsers(await this.request({ action: "list_users" }));
  }

  invite(email: string, profileId: string): Promise<SaasUserInviteResult> {
    return this.request({ action: "invite", email, profileId });
  }

  resendInvite(targetUserId: string): Promise<SaasUserInviteResult> {
    return this.request({ action: "resend_invite", targetUserId });
  }

  changeProfile(targetUserId: string, profileId: string): Promise<unknown> {
    return this.request({ action: "change_profile", targetUserId, profileId });
  }

  deactivate(targetUserId: string): Promise<unknown> {
    return this.request({ action: "deactivate", targetUserId });
  }

  reactivate(targetUserId: string): Promise<unknown> {
    return this.request({ action: "reactivate", targetUserId });
  }

  acceptInvite(): Promise<{ status: "active"; refreshSession: true }> {
    return this.request({ action: "accept_invite" });
  }
}

export function createSaasUsersRepository(
  session: SaasSession,
  config: SaasAuthConfiguration = loadSaasAuthConfiguration(import.meta.env),
  fetcher?: FetchLike,
): SupabaseSaasUsersRepository {
  return new SupabaseSaasUsersRepository(sessionFromSaasSession(session, config), fetcher);
}
