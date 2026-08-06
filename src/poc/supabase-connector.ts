import {
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
  type CommonPowerSyncDatabase,
} from "@powersync/web";

/**
 * Supabase backend connector for PowerSync POC.
 *
 * NOTE: This is a simplified connector for the POC. In production,
 * PowerSync typically connects to the PowerSync service (not directly
 * to Supabase). The service handles the sync stream; this connector
 * handles uploading local CRUD changes to Supabase via REST.
 *
 * For this POC, credentials are entered manually. In production,
 * these should come from a secure backend/auth flow.
 */
export class SupabaseConnector implements PowerSyncBackendConnector {
  constructor(
    private supabaseUrl: string,
    private supabaseKey: string
  ) {}

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    // For a real PowerSync service connection, the endpoint would be
    // the PowerSync service URL and token would be a JWT from your auth backend.
    // Since this POC validates offline write + sync structure, we return
    // dummy credentials if no real PowerSync service is configured.
    if (!this.supabaseUrl) {
      return null;
    }

    // Placeholder: real implementation would fetch a PowerSync token
    // from your backend auth service.
    return {
      endpoint: `${this.supabaseUrl}/rest/v1`,
      token: this.supabaseKey,
    };
  }

  async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
    // Upload pending CRUD changes to Supabase via REST API.
    // In a full implementation, use database.getCrudBatch() to
    // iterate changes and POST/PUT/DELETE to Supabase.
    const batch = await database.getCrudBatch(100);
    if (!batch) {
      return;
    }

    try {
      for (const entry of batch.crud) {
        const table = entry.table;
        const id = entry.id;
        const data = entry.opData ?? {};

        const url = `${this.supabaseUrl}/rest/v1/${table}?id=eq.${id}`;

        if (entry.op === "PUT" || entry.op === "PATCH") {
          await fetch(url, {
            method: "PATCH",
            headers: {
              apikey: this.supabaseKey,
              Authorization: `Bearer ${this.supabaseKey}`,
              "Content-Type": "application/json",
              Prefer: "resolution=merge-duplicates",
            },
            body: JSON.stringify(data),
          });
        } else if (entry.op === "DELETE") {
          await fetch(url, {
            method: "DELETE",
            headers: {
              apikey: this.supabaseKey,
              Authorization: `Bearer ${this.supabaseKey}`,
            },
          });
        }
      }

      await batch.complete();
    } catch (error) {
      console.error("Upload failed:", error);
      throw error;
    }
  }
}
