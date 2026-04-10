import { invoke } from "@tauri-apps/api/core";
import type { WhatsappConfig, WhatsappConfigInput } from "@/types";

export const WhatsappConfigService = {
  async buscar(): Promise<WhatsappConfig | null> {
    return invoke<WhatsappConfig | null>("carregar_config_whatsapp");
  },

  async salvar(config: WhatsappConfigInput): Promise<void> {
    return invoke<void>("salvar_config_whatsapp", { config });
  },
};