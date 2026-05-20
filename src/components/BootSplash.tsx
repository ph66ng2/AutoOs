import { cn } from "@/lib/utils";

interface BootSplashProps {
  /** 0–100 conforme progresso real da inicialização */
  progress: number;
  /** Inicia fade-out ao concluir o carregamento */
  fadeOut: boolean;
}

/**
 * Splash de arranque: logo BMP + barra proporcional ao `bootProgress`.
 * Sobreposição fullscreen até o primeiro `refreshStatus` concluir.
 */
export function BootSplash({ progress, fadeOut }: BootSplashProps) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Carregando aplicativo ${Math.round(clamped)} por cento`}
      className={cn(
        "fixed inset-0 z-[9999] flex flex-col items-center justify-center px-8 transition-opacity duration-500 ease-out",
        "bg-[#050608]",
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100",
      )}
    >
      <div className="flex w-full max-w-md flex-col items-center gap-10">
        <img
          src="/logo-bmitag.png"
          alt="BMITAG"
          className="w-full max-w-[340px] select-none drop-shadow-[0_0_32px_rgba(26,127,255,0.12)]"
          draggable={false}
        />

        <div className="w-full space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.06] ring-1 ring-white/[0.08]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 transition-[width] duration-300 ease-out"
              style={{ width: `${clamped}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] tracking-wide text-[#5a7490]">
            <span>Carregando módulos e sessão</span>
            <span className="tabular-nums text-[#7a94b0]">{Math.round(clamped)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
