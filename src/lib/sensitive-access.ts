import { invoke } from "@tauri-apps/api/core";
import { withSensitiveAccessRetry } from "@/lib/sensitive-action-retry";
import type {
  CodigoPrimeiroAcesso,
  PersonalizacaoPerfilInput,
  SecurityAuditEvent,
  SecurityProfile,
  SecurityProfileInput,
  SensitiveAccessStatus,
} from "@/types";

const sensitiveInvoke = <T>(command: string, args?: Record<string, unknown>): Promise<T> =>
  withSensitiveAccessRetry(() => args === undefined
    ? invoke<T>(command)
    : invoke<T>(command, args));

export const SensitiveAccessService = {
  async status(): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("get_sensitive_access_status");
  },

  async configurePin(pin: string, currentPin?: string): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("configure_sensitive_pin", {
      pin,
      currentPin: currentPin ?? null,
    });
  },

  async unlock(pin: string): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("unlock_sensitive_access", { pin });
  },

  async unlockWithoutPin(): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("unlock_session_without_pin");
  },

  async lock(): Promise<boolean> {
    return invoke<boolean>("lock_sensitive_access");
  },

  async setActiveProfile(profileId: number, pin: string, confirmPin?: string): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("set_active_security_profile", { profileId, pin, confirmPin: confirmPin ?? null });
  },

  async createProfile(input: SecurityProfileInput, pin: string): Promise<SensitiveAccessStatus> {
    return sensitiveInvoke<SensitiveAccessStatus>("create_security_profile", { input, pin });
  },

  async updateProfile(profileId: number, input: SecurityProfileInput, adminPin: string): Promise<SensitiveAccessStatus> {
    return sensitiveInvoke<SensitiveAccessStatus>("update_security_profile", { profileId, input, adminPin });
  },

  async listProfiles(includeInactive = false): Promise<SecurityProfile[]> {
    return sensitiveInvoke<SecurityProfile[]>("list_security_profiles", { includeInactive });
  },

  async deactivateProfile(profileId: number): Promise<SensitiveAccessStatus> {
    return sensitiveInvoke<SensitiveAccessStatus>("deactivate_security_profile", { profileId });
  },

  async reactivateProfile(profileId: number): Promise<SensitiveAccessStatus> {
    return sensitiveInvoke<SensitiveAccessStatus>("reactivate_security_profile", { profileId });
  },

  async deletarPerfil(profileId: number, adminPin: string, dbCreds: { host: string; port: number; database: string; username: string; password: string }): Promise<boolean> {
    return sensitiveInvoke<boolean>("deletar_perfil", {
      profileId,
      adminPin,
      dbUsername: dbCreds.username,
      dbPassword: dbCreds.password,
      dbHost: dbCreds.host,
      dbPort: dbCreds.port,
      dbName: dbCreds.database,
    });
  },

  async registerAuditExport(params: {
    search?: string;
    outcome?: string;
    profileId?: number;
    exportedCount: number;
  }): Promise<boolean> {
    return sensitiveInvoke<boolean>("register_security_audit_export", {
      search: params.search ?? null,
      outcome: params.outcome ?? null,
      profileId: params.profileId ?? null,
      exportedCount: params.exportedCount,
    });
  },

  async listAuditEvents(limit = 20): Promise<SecurityAuditEvent[]> {
    return sensitiveInvoke<SecurityAuditEvent[]>("list_security_audit_events", { limit });
  },

  /** Cria o perfil sem PIN e devolve o código de primeiro acesso → Rust: criar_perfil_com_codigo */
  async createProfileWithCode(input: SecurityProfileInput): Promise<CodigoPrimeiroAcesso> {
    return sensitiveInvoke<CodigoPrimeiroAcesso>("criar_perfil_com_codigo", { input });
  },

  /** Novo código para outro computador ou PIN esquecido → Rust: gerar_codigo_primeiro_acesso */
  async issueAccessCode(profileId: number, adminPin: string): Promise<CodigoPrimeiroAcesso> {
    return sensitiveInvoke<CodigoPrimeiroAcesso>("gerar_codigo_primeiro_acesso", { profileId, adminPin });
  },

  /** Ativa o perfil neste computador com o código e o PIN escolhido → Rust: ativar_perfil_com_codigo */
  async redeemAccessCode(profileId: number, codigo: string, pin: string, confirmPin: string): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("ativar_perfil_com_codigo", { profileId, codigo, pin, confirmPin });
  },

  /** Nome, ícone, cor e tema do perfil da sessão → Rust: salvar_personalizacao_perfil */
  async savePersonalization(input: PersonalizacaoPerfilInput): Promise<SensitiveAccessStatus> {
    return sensitiveInvoke<SensitiveAccessStatus>("salvar_personalizacao_perfil", { input });
  },

  /** Marca as permissões atuais como apresentadas pelo tour → Rust: registrar_tour_visto */
  async markTourSeen(): Promise<SensitiveAccessStatus> {
    return sensitiveInvoke<SensitiveAccessStatus>("registrar_tour_visto");
  },

  /** Últimas ações do próprio perfil → Rust: listar_minhas_acoes */
  async listMyActivity(limit = 5): Promise<SecurityAuditEvent[]> {
    return sensitiveInvoke<SecurityAuditEvent[]>("listar_minhas_acoes", { limit });
  },
};
