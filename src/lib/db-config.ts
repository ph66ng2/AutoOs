import { invoke } from "@tauri-apps/api/core";
import type { DatabaseConnectionConfig } from "@/types";

export function parsePostgresConnectionUrl(value: string): DatabaseConnectionConfig | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
    if (!parsed.hostname || !parsed.username) return null;

    const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!database || database.includes("/")) return null;

    const port = parsed.port ? Number(parsed.port) : 5432;
    if (!Number.isInteger(port) || port < 1 || port > 65535) return null;

    return {
      host: parsed.hostname,
      port,
      database,
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      connection_url: parsed.toString(),
    };
  } catch {
    return null;
  }
}

export const DatabaseConfigService = {
  async load(): Promise<DatabaseConnectionConfig | null> {
    return invoke<DatabaseConnectionConfig | null>("carregar_config_banco");
  },

  async getCurrentConfig(): Promise<DatabaseConnectionConfig | null> {
    try {
      return await invoke<DatabaseConnectionConfig>("obter_config_banco_atual");
    } catch {
      return null;
    }
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

  async getInitializationError(): Promise<string | null> {
    return invoke<string | null>("obter_erro_inicializacao_banco");
  },

  async restartWithConfig(config: DatabaseConnectionConfig): Promise<boolean> {
    return invoke<boolean>("reiniciar_banco_com_config", { config });
  },
};
