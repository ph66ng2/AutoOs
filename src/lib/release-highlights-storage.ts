import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { db } from "@/lib/db";
import { RELEASE_HIGHLIGHTS_VERSION, releaseHighlightsStorageKey } from "@/lib/releaseHighlightsKey";

export async function getReleaseHighlightsVersion(): Promise<string> {
  if (isTauri()) {
    try {
      return await getVersion();
    } catch {
      // Uma falha no IPC não bloqueia a entrada no aplicativo.
    }
  }
  return RELEASE_HIGHLIGHTS_VERSION;
}

export class ReleaseHighlightsStorage {
  private shownInSession = new Set<string>();

  async hasSeen(version: string): Promise<boolean> {
    if (this.shownInSession.has(version)) return true;
    if (isTauri()) {
      try {
        if (await db.getSeenReleaseHighlights() === version) {
          this.shownInSession.add(version);
          return true;
        }
      } catch {
        // Arquivo indisponível ou inválido: tenta o registro do WebView.
      }
    }
    try {
      if (window.localStorage.getItem(releaseHighlightsStorageKey(version)) === "seen") {
        // Migra inclusive a chave publicada na 0.6.2 para o arquivo nativo.
        void this.markSeen(version);
        return true;
      }
    } catch {
      // Sem disco e sem localStorage, a sessão ainda evita remontagens repetidas.
    }
    return this.shownInSession.has(version);
  }

  async markSeen(version: string): Promise<void> {
    this.shownInSession.add(version);
    try {
      window.localStorage.setItem(releaseHighlightsStorageKey(version), "seen");
    } catch {
      // O arquivo nativo independe do armazenamento do WebView.
    }
    if (isTauri()) {
      try {
        await db.markReleaseHighlightsSeen();
      } catch {
        // O fallback local e a memória da sessão continuam válidos.
      }
    }
  }
}

export const releaseHighlightsStorage = new ReleaseHighlightsStorage();
