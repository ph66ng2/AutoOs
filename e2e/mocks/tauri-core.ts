/** Mock mínimo de IPC para Playwright; não substitui Tauri/PostgreSQL real. */
const status = {
  pin_configured: true, unlocked: true, expires_at: null,
  active_profile_id: 1, active_profile_name: "Atendente de teste", active_role: "ATENDENTE",
  permissions: ["FINANCIAL_ACTIONS"], can_manage_profiles: false, profiles: [],
};

/** Stubs de runtime exigidos por @tauri-apps/plugin-updater durante o bootstrap. */
export class Resource {}
export class Channel<T> {
  onmessage: ((message: T) => void) | null = null;
}

export function isTauri(): boolean {
  return false;
}

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case "criar_cliente":
      if ((args?.input as { documento?: string } | undefined)?.documento === "52998224725") {
        throw new Error("Este CPF/CNPJ já está cadastrado em um cliente ativo. Pesquise pelo documento para localizar o registro.");
      }
      return undefined as T;
    case "verificar_status_banco": return true as T;
    case "get_sensitive_access_status":
    case "set_active_security_profile":
    case "unlock_sensitive_access": return status as T;
    case "lock_sensitive_access": return true as T;
    case "listar_equipamentos":
    case "listar_clientes":
    case "buscar_equipamentos_por_serial": return [] as T;
    case "listar_equipamentos_paginados":
    case "listar_clientes_paginados":
    case "listar_produtos_paginados":
    case "listar_servicos_paginados": return { items: [], total: 0 } as T;
    default: return undefined as T;
  }
}
