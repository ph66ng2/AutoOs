import { invoke } from "@tauri-apps/api/core";
import type { DatabaseConnectionConfig } from "@/types";

export const DatabaseConfigService = {
  async load(): Promise<DatabaseConnectionConfig | null> {
    return invoke<DatabaseConnectionConfig | null>("carregar_config_banco");
  },

  async save(config: DatabaseConnectionConfig): Promise<void> {
    return invoke("salvar_config_banco", { config });
  },

  async test(config: DatabaseConnectionConfig): Promise<boolean> {
    return invoke<boolean>("testar_config_banco", { config });
  },

  async checkStatus(): Promise<boolean> {
    return invoke<boolean>("verificar_status_banco");
  },

  async restartWithConfig(config: DatabaseConnectionConfig): Promise<boolean> {
    return invoke<boolean>("reiniciar_banco_com_config", { config });
  },
};
