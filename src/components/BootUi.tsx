import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { markDailyBootOpeningPlayed, shouldPlayDailyBootOpening } from "@/lib/daily-boot-opening";

interface BootUiContextValue {
  /** false enquanto a abertura (stamp) ainda está na tela */
  openingComplete: boolean;
  /** Marca o fim da abertura; login/PIN/modo só depois disso */
  completeOpening: () => void;
}

const BootUiContext = createContext<BootUiContextValue>({
  openingComplete: true,
  completeOpening: () => undefined,
});

export function BootUiProvider({ children }: { children: ReactNode }) {
  const [openingComplete, setOpeningComplete] = useState(() => !shouldPlayDailyBootOpening());
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
