import { useEffect, useState } from "react";
import { BootSplash } from "@/components/BootSplash";

/**
 * Primeiro boot do dia: a abertura fica 5s na tela, mesmo se o backend já tiver respondido.
 */
export const MIN_BOOT_SPLASH_MS =
  import.meta.env.VITE_E2E_MOCK === "1" ? 200 : 5_000;
const BOOT_FADE_MS = 540;
/**
 * Fallback após o boot real concluir, se o stamp não sinalizar "done".
 */
const STAMP_COMPLETION_FALLBACK_MS =
  import.meta.env.VITE_E2E_MOCK === "1" ? 400 : 5_000;

interface BootSplashGateProps {
  /** true enquanto a infraestrutura/sessão ainda não terminou de carregar */
  loading: boolean;
  /** 0–100 conforme fases reais do arranque */
  progress: number;
  /** Chamado quando o splash terminou o fade-out e foi removido do DOM */
  onFinished?: () => void;
}

/**
 * Controla visibilidade, tempo mínimo e fade-out do BootSplash.
 * Espera o progresso real e a animação stamp (ph66ng2/stamp) antes de sair.
 */
export function BootSplashGate({ loading, progress, onFinished }: BootSplashGateProps) {
  const [splashVisible, setSplashVisible] = useState(true);
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
  const [stampComplete, setStampComplete] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMinSplashElapsed(true), MIN_BOOT_SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    if (loading) {
      setStampComplete(false);
      return;
    }
    const t = window.setTimeout(() => setStampComplete(true), STAMP_COMPLETION_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [loading]);

  const splashCanFadeOut = !loading && minSplashElapsed && stampComplete;

  useEffect(() => {
    if (splashVisible && splashCanFadeOut) {
      const t = window.setTimeout(() => {
        setSplashVisible(false);
        onFinished?.();
      }, BOOT_FADE_MS);
      return () => window.clearTimeout(t);
    }
  }, [splashVisible, splashCanFadeOut, onFinished]);

  if (!splashVisible) return null;

  return (
    <BootSplash
      progress={loading ? progress : 100}
      fadeOut={splashCanFadeOut}
      onStampComplete={() => setStampComplete(true)}
    />
  );
}
