export type AppMode = "standard" | "counter";

const APP_MODE_KEY = "autoos_app_mode";

export function getAppMode(): AppMode | null {
  try {
    const value = localStorage.getItem(APP_MODE_KEY);
    return value === "standard" || value === "counter" ? value : null;
  } catch {
    return null;
  }
}

export function setAppMode(mode: AppMode): void {
  try {
    localStorage.setItem(APP_MODE_KEY, mode);
  } catch {
    // A aplicação continua utilizável em WebViews onde o armazenamento local falhar.
  }
  window.dispatchEvent(new CustomEvent<AppMode>("autoos:app-mode", { detail: mode }));
}

/**
 * Estado de navegação que pede a troca de modo. Trocar o modo antes de navegar deixaria o modo
 * novo gravado quando a pessoa cancela a saída ("Continuar editando"): o `AppModeRedirect`
 * aplica o pedido só quando a navegação chega de fato.
 */
export function pedirModoAoNavegar(mode: AppMode): { trocarModo: AppMode } {
  return { trocarModo: mode };
}

export function modoPedidoAoNavegar(state: unknown): AppMode | null {
  const pedido = state && typeof state === "object" ? (state as { trocarModo?: unknown }).trocarModo : undefined;
  return pedido === "standard" || pedido === "counter" ? pedido : null;
}
