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
}
