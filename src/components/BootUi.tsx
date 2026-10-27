import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { markDailyBootOpeningPlayed, shouldPlayDailyBootOpening } from "@/lib/daily-boot-opening";

/** E2E (mock) pula a abertura do carimbo para não alongar cada teste. */
const IS_E2E_MOCK = import.meta.env.VITE_E2E_MOCK === "1";
/** Trava de segurança: o PIN nunca fica bloqueado pela animação por mais que isso. */
export const BOOT_ANIMATION_HARD_LIMIT_MS = 20_000;

interface BootUiContextValue {
  /** false enquanto a abertura do dia (carimbo BMITAG) ainda está na tela */
  openingComplete: boolean;
  /** Marca o fim da abertura (carimbo) */
  completeOpening: () => void;
  /** false enquanto a animação de boot (carimbo + impressora) ainda está tocando */
  bootAnimationComplete: boolean;
  /** Marca o fim da animação de boot; PIN/perfil só aparecem depois disso */
  completeBootAnimation: () => void;
}

const BootUiContext = createContext<BootUiContextValue>({
  openingComplete: true,
  completeOpening: () => undefined,
  bootAnimationComplete: true,
  completeBootAnimation: () => undefined,
});

export function BootUiProvider({ children }: { children: ReactNode }) {
  const [openingComplete, setOpeningComplete] = useState(
    () => IS_E2E_MOCK || !shouldPlayDailyBootOpening(),
  );
  const completeOpening = useCallback(() => {
    markDailyBootOpeningPlayed();
    setOpeningComplete(true);
  }, []);
  const [bootAnimationComplete, setBootAnimationComplete] = useState(IS_E2E_MOCK);
  const completeBootAnimation = useCallback(() => setBootAnimationComplete(true), []);
  useEffect(() => {
    if (bootAnimationComplete) return;
    const t = window.setTimeout(() => {
      markDailyBootOpeningPlayed();
      setOpeningComplete(true);
      setBootAnimationComplete(true);
    }, BOOT_ANIMATION_HARD_LIMIT_MS);
    return () => window.clearTimeout(t);
  }, [bootAnimationComplete]);
  const value = useMemo(
    () => ({ openingComplete, completeOpening, bootAnimationComplete, completeBootAnimation }),
    [openingComplete, completeOpening, bootAnimationComplete, completeBootAnimation],
  );
  return <BootUiContext.Provider value={value}>{children}</BootUiContext.Provider>;
}

export function useBootUi() {
  return useContext(BootUiContext);
}
