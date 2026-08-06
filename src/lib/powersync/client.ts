import {
  PowerSyncDatabase,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
  type CommonPowerSyncDatabase,
} from "@powersync/web";
import { AppSchema } from "./AppSchema";
import { db as tauriDb } from "../db";

let _powerSyncDb: PowerSyncDatabase | undefined;

export function powerSyncDb(): PowerSyncDatabase {
  if (!_powerSyncDb) {
    _powerSyncDb = new PowerSyncDatabase({
      schema: AppSchema,
      database: {
        dbFilename: "autoos.db",
      },
    });
  }
  return _powerSyncDb;
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const config = await tauriDb.carregarConfigStorage();
    if (config?.supabase_url && config?.supabase_service_key) {
      return {
        endpoint: `${config.supabase_url}/rest/v1`,
        token: config.supabase_service_key,
      };
    }

    return null;
  }

  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    const batch = await database.getCrudBatch(100);
    if (!batch) {
      return;
    }

    const config = await tauriDb.carregarConfigStorage();
    const supabaseUrl = config?.supabase_url;
    const supabaseKey = config?.supabase_service_key;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Supabase credentials not configured");
    }

    try {
      for (const entry of batch.crud) {
        const table = entry.table;
        const id = entry.id;
        const data = entry.opData ?? {};

        const url = `${supabaseUrl}/rest/v1/${table}?id=eq.${id}`;

        if (entry.op === "PUT" || entry.op === "PATCH") {
          await fetch(url, {
            method: "PATCH",
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify(data),
          });
        } else if (entry.op === "DELETE") {
          await fetch(url, {
            method: "DELETE",
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          });
        }
      }

      await batch.complete();
    } catch (error) {
      console.error("PowerSync upload failed:", error);
      throw error;
    }
  }
}

export async function initPowerSync(): Promise<void> {
  await powerSyncDb().init();
}

export async function connectPowerSync(): Promise<void> {
  const connector = new SupabaseConnector();
  await powerSyncDb().connect(connector);
}

export async function disconnectPowerSync(): Promise<void> {
  await powerSyncDb().disconnect();
}

// ─── Helpers ─────────────────────────────────────────────

/** Gera UUID v4 compatível com o id text do PowerSync. */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: UUID v4 generation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedEmpresaId: string | undefined;

/** Obtém o empresa_id atual (do config storage ou fallback). */
export async function getEmpresaId(): Promise<string> {
  if (cachedEmpresaId) return cachedEmpresaId;
  try {
    const config = await tauriDb.carregarConfigStorage();
    cachedEmpresaId = config?.empresa_id || "autoos-default";
  } catch {
    cachedEmpresaId = "autoos-default";
  }
  return cachedEmpresaId;
}

/** Reseta o cache de empresa_id (útil em logout/troca de empresa). */
export function resetEmpresaId(): void {
  cachedEmpresaId = undefined;
}
