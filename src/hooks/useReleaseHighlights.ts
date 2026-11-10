import { useEffect, useState } from "react";
import { getReleaseHighlightsVersion, releaseHighlightsStorage } from "@/lib/release-highlights-storage";

export function useReleaseHighlights(enabled: boolean) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setVersion(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const installedVersion = await getReleaseHighlightsVersion();
      const seen = await releaseHighlightsStorage.hasSeen(installedVersion);
      if (cancelled || seen) return;
      // Registra na apresentação: fechar o app ou trocar o perfil não repete o card.
      await releaseHighlightsStorage.markSeen(installedVersion);
      if (!cancelled) setVersion(installedVersion);
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return { version, open: enabled && version !== null, dismiss: () => setVersion(null) };
}
