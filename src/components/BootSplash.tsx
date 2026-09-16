import { cn } from "@/lib/utils";
import { AutoOsBootAnimation, bootStatusLabel } from "@/components/AutoOsBootAnimation";

interface BootSplashProps {
  /** 0–100 conforme progresso real da inicialização */
  progress: number;
  /** Inicia fade-out ao concluir o carregamento */
  fadeOut: boolean;
}

/**
 * Splash de arranque: fluxo vetorial proporcional ao `bootProgress`.
 * Sobreposição fullscreen até o primeiro `refreshStatus` concluir.
 */
export function BootSplash({ progress, fadeOut }: BootSplashProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const statusLabel = bootStatusLabel(clamped);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Carregando aplicativo ${Math.round(clamped)} por cento`}
      className={cn(
        "fixed inset-0 z-40 flex flex-col items-center justify-center px-8 transition-opacity duration-500 ease-out",
        "bg-[#050608]",
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100",
      )}
    >
      <div className="flex w-full max-w-xl flex-col items-center">
        <AutoOsBootAnimation progress={clamped} />
        <div className="-mt-2 flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-medium tracking-[0.16em] text-slate-300">
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
                  "h-1.5 rounded-full transition-all duration-500",
                  clamped >= threshold ? "w-5 bg-sky-700" : "w-1.5 bg-slate-700",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
