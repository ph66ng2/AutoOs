import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { markDailyBootOpeningPlayed, shouldPlayDailyBootOpening } from "@/lib/daily-boot-opening";

/** E2E (mock) pula a abertura do carimbo para não alongar cada teste. */
const IS_E2E_MOCK = import.meta.env.VITE_E2E_MOCK === "1";

interface BootUiContextValue {
  /** false enquanto a abertura do dia (carimbo BMITAG) ainda está na tela */
  openingComplete: boolean;
  /** Marca o fim da abertura; PIN/perfil só aparecem depois disso */
  completeOpening: () => void;
}

const BootUiContext = createContext<BootUiContextValue>({
  openingComplete: true,
  completeOpening: () => undefined,
});

export function BootUiProvider({ children }: { children: ReactNode }) {
  const [openingComplete, setOpeningComplete] = useState(
    () => IS_E2E_MOCK || !shouldPlayDailyBootOpening(),
  );
  const completeOpening = useCallback(() => {
    markDailyBootOpeningPlayed();
    setOpeningComplete(true);
  }, []);
  const value = useMemo(
    () => ({ openingComplete, completeOpening }),
    [openingComplete, completeOpening],
  );
  return <BootUiContext.Provider value={value}>{children}</BootUiContext.Provider>;
}

export function useBootUi() {
  return useContext(BootUiContext);
}
