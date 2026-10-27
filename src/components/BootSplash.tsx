import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AutoOsBootAnimation,
  bootStatusLabel,
  useSmoothedProgress,
  useTrickledProgress,
} from "@/components/AutoOsBootAnimation";
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
  /** Alias usado pelo BootSplashGate da linha SaaS. */
  onStampComplete?: () => void;
}

/**
 * Splash de arranque.
 * Primeira abertura do dia: carimbo BMITAG → impressora. Demais aberturas: só a impressora,
 * com o desenho proporcional ao `bootProgress` real.
 */
export function BootSplash({ progress, fadeOut, onAnimationComplete, onStampComplete }: BootSplashProps) {
  onAnimationComplete = onAnimationComplete ?? onStampComplete;
  const { openingComplete, completeOpening, completeBootAnimation } = useBootUi();
  const [openingLeaving, setOpeningLeaving] = useState(false);
  const leavingRef = useRef(false);
  const clamped = Math.min(100, Math.max(0, progress));
  const showOpening = !openingComplete;
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);
  const handlePrinterComplete = useCallback(() => {
    completeBootAnimation();
    onAnimationCompleteRef.current?.();
  }, [completeBootAnimation]);

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
        <PrinterStage progress={clamped} onComplete={handlePrinterComplete} />
      )}
    </div>
  );
}

interface PrinterStageProps {
  progress: number;
  onComplete: () => void;
}

/** Impressora + barra. Monta só depois do carimbo, para o desenho começar do zero. */
function PrinterStage({ progress, onComplete }: PrinterStageProps) {
  // Barra e impressora andam juntas: marcos reais + avanço lento entre eles, suavizado.
  const shown = useSmoothedProgress(useTrickledProgress(progress));
  const percent = Math.floor(shown);
  const statusLabel = bootStatusLabel(shown);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <AutoOsBootAnimation progress={shown} onComplete={onComplete} />
        <div className="flex w-full max-w-[280px] flex-col items-center gap-2 text-center">
          <p
            key={statusLabel}
            className="boot-label-in text-sm font-medium tracking-[0.16em] text-slate-300"
          >
            {statusLabel}
          </p>
          <p className="text-xs tracking-wide text-[#5f7890]">
            Organizando seu atendimento
          </p>
          <div className="mt-3 flex w-full items-center gap-3">
            <div
              role="progressbar"
              aria-label="Progresso da inicialização"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="relative h-1 flex-1 overflow-hidden rounded-full bg-slate-800"
            >
              <div
                className={cn(
                  "boot-bar-fill absolute inset-y-0 left-0 w-full origin-left rounded-full bg-sky-600",
                  percent >= 100 && "bg-teal-400",
                )}
                style={{ transform: `scaleX(${shown / 100})` }}
              />
            </div>
            <span className="w-9 text-right text-[11px] font-medium tabular-nums text-[#5f7890]">
              {percent}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
