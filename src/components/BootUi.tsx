import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** E2E (mock) não segura o PIN pela abertura, para não alongar cada teste. */
const IS_E2E_MOCK = import.meta.env.VITE_E2E_MOCK === "1";
/** Trava de segurança: o PIN nunca fica bloqueado pela animação por mais que isso. */
export const BOOT_ANIMATION_HARD_LIMIT_MS = 20_000;

interface BootUiContextValue {
  /** false enquanto a abertura BMI TAG ainda está tocando */
  bootAnimationComplete: boolean;
  /** Marca o fim da abertura; PIN/perfil só aparecem depois disso */
  completeBootAnimation: () => void;
}

const BootUiContext = createContext<BootUiContextValue>({
  bootAnimationComplete: true,
  completeBootAnimation: () => undefined,
});

export function BootUiProvider({ children }: { children: ReactNode }) {
  const [bootAnimationComplete, setBootAnimationComplete] = useState(IS_E2E_MOCK);
  const completeBootAnimation = useCallback(() => setBootAnimationComplete(true), []);
  useEffect(() => {
    if (bootAnimationComplete) return;
    const t = window.setTimeout(() => setBootAnimationComplete(true), BOOT_ANIMATION_HARD_LIMIT_MS);
    return () => window.clearTimeout(t);
  }, [bootAnimationComplete]);
  const value = useMemo(
    () => ({ bootAnimationComplete, completeBootAnimation }),
    [bootAnimationComplete, completeBootAnimation],
  );
  return <BootUiContext.Provider value={value}>{children}</BootUiContext.Provider>;
}

export function useBootUi() {
  return useContext(BootUiContext);
}
