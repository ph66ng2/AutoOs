import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useBootUi } from "@/components/BootUi";
import { BmiTagOpening } from "@/components/opening/BmiTagOpening";

interface BootSplashProps {
  /** 0–100 conforme progresso real da inicialização */
  progress: number;
  /** Inicia a saída ao concluir o carregamento */
  fadeOut: boolean;
  /** Chamado uma vez, quando a abertura BMI TAG termina de montar a logo */
  onAnimationComplete?: () => void;
  /** Alias usado pelo BootSplashGate da linha SaaS. */
  onStampComplete?: () => void;
}

/**
 * Splash de arranque: a abertura BMI TAG, em toda inicialização.
 * Se o carregamento passar da abertura, a logo fica parada com um aviso discreto.
 */
export function BootSplash({ progress, fadeOut, onAnimationComplete, onStampComplete }: BootSplashProps) {
  onAnimationComplete = onAnimationComplete ?? onStampComplete;
  const { completeBootAnimation } = useBootUi();
  const clamped = Math.min(100, Math.max(0, progress));
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  const handleIntroDone = useCallback(() => {
    completeBootAnimation();
    onAnimationCompleteRef.current?.();
  }, [completeBootAnimation]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Carregando aplicativo ${Math.round(clamped)} por cento`}
      className={cn("fixed inset-0 z-40", fadeOut && "pointer-events-none")}
    >
      <BmiTagOpening
        ready={fadeOut}
        onIntroDone={handleIntroDone}
        status={clamped < 100 ? "Iniciando o AutoOS" : undefined}
      />
    </div>
  );
}
