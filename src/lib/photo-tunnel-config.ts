import { invoke } from "@tauri-apps/api/core";
import type { PhotoTunnelConfig, PhotoTunnelConfigInput } from "@/types";

export const PhotoTunnelConfigService = {
  async buscar(): Promise<PhotoTunnelConfig | null> {
    return invoke<PhotoTunnelConfig | null>("carregar_config_photo_tunnel");
  },

  async salvar(config: PhotoTunnelConfigInput): Promise<void> {
    return invoke<void>("salvar_config_photo_tunnel", { config });
  },
};
