/**
 * Notificação do Windows (plugin oficial do Tauri) quando o app está minimizado ou sem foco.
 * Com o app na frente, o aviso rápido dentro da tela basta. A escolha é deste computador
 * (Perfil › Notificações), ligada por padrão; fora do Tauri (testes, navegador) não faz nada.
 */
const CHAVE_PREFERENCIA = "autoos:avisos-windows";

export function avisosWindowsLigados(): boolean {
  try {
    return localStorage.getItem(CHAVE_PREFERENCIA) !== "off";
  } catch {
    return true;
  }
}

export function definirAvisosWindows(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE_PREFERENCIA, ligado ? "on" : "off");
  } catch {
    // Sem armazenamento: fica o padrão (ligado).
  }
}

function appEmPrimeiroPlano() {
  return document.visibilityState === "visible" && document.hasFocus();
}

export async function notificarSistema(titulo: string, corpo?: string | null): Promise<boolean> {
  if (appEmPrimeiroPlano() || !avisosWindowsLigados()) return false;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
    let permitido = await isPermissionGranted();
    if (!permitido) permitido = (await requestPermission()) === "granted";
    if (!permitido) return false;
    sendNotification({ title: titulo, body: corpo ?? undefined });
    return true;
  } catch {
    return false;
  }
}
