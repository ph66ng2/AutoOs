import { invoke } from "@tauri-apps/api/core";
import type {
  SecurityAuditEvent,
  SecurityProfile,
  SecurityProfileInput,
  SensitiveAccessStatus,
} from "@/types";

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

  async setActiveProfile(profileId: number): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("set_active_security_profile", { profileId });
  },

  async createProfile(input: SecurityProfileInput, pin: string): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("create_security_profile", { input, pin });
  },

  async updateProfile(profileId: number, input: SecurityProfileInput, adminPin: string): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("update_security_profile", { profileId, input, adminPin });
  },

  async resetProfilePin(profileId: number, newPin: string, adminPin: string): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("reset_security_profile_pin", { profileId, newPin, adminPin });
  },

  async listProfiles(includeInactive = false): Promise<SecurityProfile[]> {
    return invoke<SecurityProfile[]>("list_security_profiles", { includeInactive });
  },

  async deactivateProfile(profileId: number): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("deactivate_security_profile", { profileId });
  },

  async reactivateProfile(profileId: number): Promise<SensitiveAccessStatus> {
    return invoke<SensitiveAccessStatus>("reactivate_security_profile", { profileId });
  },

  async deletarPerfil(profileId: number, adminPin: string, dbCreds: { host: string; port: number; database: string; username: string; password: string }): Promise<boolean> {
    return invoke<boolean>("deletar_perfil", {
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
    return invoke<boolean>("register_security_audit_export", {
      search: params.search ?? null,
      outcome: params.outcome ?? null,
      profileId: params.profileId ?? null,
      exportedCount: params.exportedCount,
    });
  },

  async listAuditEvents(limit = 20): Promise<SecurityAuditEvent[]> {
    return invoke<SecurityAuditEvent[]>("list_security_audit_events", { limit });
  },
};