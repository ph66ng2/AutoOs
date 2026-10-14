import { todayLocalIsoDate } from "@/lib/date-utils";

/** Data local (YYYY-MM-DD) do último stamp de abertura que já rodou nesta máquina. */
export const DAILY_BOOT_OPENING_STORAGE_KEY = "autoos:daily-boot-opening";

export function shouldPlayDailyBootOpening(now = new Date()): boolean {
  try {
    return window.localStorage.getItem(DAILY_BOOT_OPENING_STORAGE_KEY) !== todayLocalIsoDate(now);
  } catch {
    return true;
  }
}

export function markDailyBootOpeningPlayed(now = new Date()): void {
  try {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, todayLocalIsoDate(now));
  } catch {
    // Sem storage, o próximo arranque pode repetir a abertura — melhor que pular o primeiro do dia.
  }
}
