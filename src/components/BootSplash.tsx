import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AutoOsBootAnimation, bootStatusLabel } from "@/components/AutoOsBootAnimation";
import { useBootUi } from "@/components/BootUi";
import { StampDemo } from "@/components/stamp/StampDemo";
import "@/components/stamp/stamp-boot-shell.css";

/** Crossfade entre o carimbo BMITAG e a impressora. */
const OPENING_EXIT_MS = 450;
/** Se o carimbo não sinalizar "done" (aba em segundo plano, falha de animação), segue para a impressora. */
const OPENING_FALLBACK_MS = 9_000;

interface BootSplashProps {
  /** 0–100 conforme progresso real da inicialização */
  progress: number;
  /** Inicia fade-out ao concluir o carregamento */
  fadeOut: boolean;
  /** Chamado quando a impressora terminou e a marca BMITAG assentou */
  onAnimationComplete?: () => void;
}

/**
 * Splash de arranque.
 * Primeira abertura do dia: carimbo BMITAG → impressora. Demais aberturas: só a impressora,
 * com o desenho proporcional ao `bootProgress` real.
 */
export function BootSplash({ progress, fadeOut, onAnimationComplete }: BootSplashProps) {
  const { openingComplete, completeOpening } = useBootUi();
  const [openingLeaving, setOpeningLeaving] = useState(false);
  const leavingRef = useRef(false);
  const clamped = Math.min(100, Math.max(0, progress));
  const statusLabel = bootStatusLabel(clamped);
  const showOpening = !openingComplete;

  const finishOpening = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setOpeningLeaving(true);
  }, []);

  useEffect(() => {
    if (!openingLeaving) return;
    const t = window.setTimeout(completeOpening, OPENING_EXIT_MS);
    return () => window.clearTimeout(t);
  }, [openingLeaving, completeOpening]);

  useEffect(() => {
    if (!showOpening) return;
    const t = window.setTimeout(finishOpening, OPENING_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [showOpening, finishOpening]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Carregando aplicativo ${Math.round(clamped)} por cento`}
      className={cn(
        "fixed inset-0 z-40 bg-[#050608] transition-opacity duration-500 ease-out",
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100",
      )}
    >
      {showOpening ? (
        <div
          data-testid="boot-opening-stamp"
          className={cn(
            "page-solo is-boot is-opening h-full w-full transition-[opacity,transform,filter] duration-[450ms] ease-in",
            openingLeaving && "boot-stage-out",
          )}
        >
          <div className="stamp-solo">
            <StampDemo mode="loading" motion="cinematic" sound onComplete={finishOpening} />
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center px-8">
          <div className="flex w-full max-w-xl flex-col items-center">
            <AutoOsBootAnimation progress={clamped} onComplete={onAnimationComplete} />
            <div className="-mt-2 flex flex-col items-center gap-2 text-center">
              <p
                key={statusLabel}
                className="boot-label-in text-sm font-medium tracking-[0.16em] text-slate-300"
              >
                {statusLabel}
              </p>
              <p className="text-xs tracking-wide text-[#5f7890]">
                Organizando seu atendimento
              </p>
              <div className="mt-2 flex gap-1.5" aria-hidden="true">
                {[18, 42, 68, 92].map((threshold) => (
                  <span
                    key={threshold}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
                      clamped >= threshold ? "w-5 bg-sky-700" : "w-1.5 bg-slate-700",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
