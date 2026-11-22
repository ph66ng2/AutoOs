export interface SaasIdentity {
  userId: string;
  companyId: string;
  profileId: string;
  email: string;
}

export interface SaasSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  identity: SaasIdentity;
  profile: SaasOperationalProfile;
}

/** Perfil operacional autorizado pela nuvem; não é uma segunda identidade cloud. */
export interface SaasOperationalProfile {
  id: string;
  name: string;
  role: string;
  permissions: string[];
}

export type SaasAuthState =
  | { kind: "booting" }
  | { kind: "authenticated"; session: SaasSession }
  | { kind: "locked"; session: SaasSession }
  | { kind: "expired"; email?: string; message: string }
  | { kind: "offline_recoverable"; session: SaasSession; message: string }
  | { kind: "signed_out"; message?: string };

export type SaasRestoreResult = Exclude<SaasAuthState, { kind: "booting" | "locked" }>;

export interface SaasSignOutResult {
  revoked: boolean;
}

export interface SaasAuthService {
  login(email: string, password: string): Promise<SaasSession>;
  restoreSession(): Promise<SaasRestoreResult>;
  refreshSession(session: SaasSession): Promise<SaasRestoreResult>;
  lock(): Promise<void>;
  signOut(session?: SaasSession): Promise<SaasSignOutResult>;
  removeThisDevice(session?: SaasSession): Promise<SaasSignOutResult>;
  requestPasswordRecovery(email: string): Promise<void>;
}

export type SaasAuthErrorCode =
  | "configuration"
  | "invalid_credentials"
  | "account_unavailable"
  | "invalid_claims"
  | "network"
  | "expired"
  | "keyring";

export class SaasAuthError extends Error {
  constructor(
    public readonly code: SaasAuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SaasAuthError";
  }
}
