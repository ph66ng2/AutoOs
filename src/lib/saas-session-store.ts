import { invoke } from "@tauri-apps/api/core";
import type { SaasSession } from "@/types/saas-auth";

export interface SaasSessionStore {
  load(): Promise<SaasSession | null>;
  save(session: SaasSession): Promise<void>;
  clear(): Promise<void>;
}

export const tauriSaasSessionStore: SaasSessionStore = {
  load: () => invoke<SaasSession | null>("carregar_sessao_saas"),
  async save(session) {
    await invoke("salvar_sessao_saas", { session });
  },
  async clear() {
    await invoke("remover_sessao_saas");
  },
};
