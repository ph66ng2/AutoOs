import { invoke } from "@tauri-apps/api/core";

export interface SaasDeviceMarker {
  deviceId: string;
}

export interface SaasDeviceStore {
  load(): Promise<SaasDeviceMarker | null>;
  create(): Promise<SaasDeviceMarker>;
  clear(): Promise<void>;
}

export const tauriSaasDeviceStore: SaasDeviceStore = {
  load: () => invoke<SaasDeviceMarker | null>("carregar_marcador_dispositivo_saas"),
  create: () => invoke<SaasDeviceMarker>("criar_marcador_dispositivo_saas"),
  clear: () => invoke("remover_marcador_dispositivo_saas"),
};
