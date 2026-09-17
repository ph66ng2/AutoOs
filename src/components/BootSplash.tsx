import { cn } from "@/lib/utils";
import { StampDemo } from "@/components/stamp/StampDemo";
import { bootStatusLabel } from "@/components/AutoOsBootAnimation";
import "@/components/stamp/stamp.css";
import "@/components/stamp/stamp-boot-shell.css";

interface BootSplashProps {
  /** 0–100 conforme progresso real da inicialização */
  progress: number;
  /** Inicia fade-out ao concluir o carregamento */
  fadeOut: boolean;
  /** Chamado quando a animação stamp chega em "done" */
  onStampComplete?: () => void;
}

/**
 * Splash de arranque: animação stamp (ph66ng2/stamp) dirigida pelo progresso real.
 */
export function BootSplash({ progress, fadeOut, onStampComplete }: BootSplashProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const statusLabel = bootStatusLabel(clamped);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Carregando aplicativo ${Math.round(clamped)} por cento. ${statusLabel}`}
      className={cn(
        "fixed inset-0 z-[9999] transition-opacity duration-500 ease-out",
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100",
      )}
    >
      <div className="page-solo is-boot h-full w-full">
        <div className="stamp-solo">
          <StampDemo
            mode="loading"
            motion="cinematic"
            sound
            progress={clamped}
            onComplete={onStampComplete}
          />
        </div>
      </div>
    </div>
  );
}
