import { invoke } from "@tauri-apps/api/core";

export interface SaasProfilePinStatus {
  configured: boolean;
  lockedUntil: number | null;
}

/**
 * Ponte para o PIN operacional local do SaaS. O PIN nunca passa pelo Supabase:
 * estes comandos o guardam somente no keyring, indexado por dispositivo+perfil.
 */
export const tauriSaasProfilePinStore = {
  status(profileId: string) {
    return invoke<SaasProfilePinStatus>("status_pin_perfil_saas", { profileId });
  },
  configure(profileId: string, pin: string) {
    return invoke<void>("configurar_pin_perfil_saas", { profileId, pin });
  },
  unlock(profileId: string, pin: string) {
    return invoke<void>("desbloquear_pin_perfil_saas", { profileId, pin });
  },
  remove(profileId: string) {
    return invoke<void>("remover_pin_perfil_saas", { profileId });
  },
  syncAuthorizedProfiles(profileIds: string[]) {
    return invoke<void>("sincronizar_pins_perfis_saas", { profileIds });
  },
};
