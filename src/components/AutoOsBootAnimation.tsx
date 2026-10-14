import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AutoOsBootAnimationProps {
  /** 0–100 do boot real; a animação persegue esse alvo de forma suave. */
  progress: number;
  /** Chamado uma vez quando a marca BMITAG terminou de assentar na tela. */
  onComplete?: () => void;
}

/** Velocidade máxima do desenho (% por segundo): saltos 0→100 ainda mostram a impressora sendo traçada. */
const MAX_SPEED = 72;
/** Velocidade mínima para não arrastar a cauda da aproximação. */
const MIN_SPEED = 16;
/** Tempo que a marca fica assentada antes de liberar o fade-out do splash. */
const BRAND_HOLD_MS = 1_150;
const BRAND_HOLD_REDUCED_MS = 450;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const phase = (progress: number, start: number, end: number) =>
  clamp01((progress - start) / (end - start));
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

function prefersReducedMotion() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Persegue o progresso real com aceleração suave e velocidade limitada,
 * transformando os saltos discretos do boot (6 → 38 → 86 → 100) em um traço contínuo.
 */
function useSmoothedProgress(target: number) {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion() || typeof window.requestAnimationFrame !== "function") {
      valueRef.current = target;
      setValue(target);
      return;
    }

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const current = valueRef.current;
      const gap = target - current;
      if (Math.abs(gap) < 0.05) {
        valueRef.current = target;
        setValue(target);
        return;
      }
      const eased = Math.abs(gap) * (1 - Math.exp(-dt * 4.2));
      const step = Math.min(Math.abs(gap), MAX_SPEED * dt, Math.max(MIN_SPEED * dt, eased));
      const next = current + Math.sign(gap) * step;
      valueRef.current = next;
      setValue(next);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

export function bootStatusLabel(progress: number): string {
  if (progress >= 100) return "Tudo pronto";
  if (progress >= 86) return "Finalizando o atendimento";
  if (progress >= 38) return "Preparando sua sessão";
  if (progress >= 14) return "Carregando módulos";
  return "Iniciando o AutoOS";
}

interface ChecklistRowProps {
  y: number;
  amount: number;
  lineEnd: number;
  tone: "done" | "service";
  pulse?: boolean;
}

/** Linha do recibo: o selo "estala" (overshoot), o ícone é traçado e a linha corre em seguida. */
function ChecklistRow({ y, amount, lineEnd, tone, pulse }: ChecklistRowProps) {
  const pop = easeOutBack(phase(amount, 0, 0.55));
  const icon = easeOutCubic(phase(amount, 0.25, 0.75));
  const line = easeOutCubic(phase(amount, 0.4, 1));
  const isService = tone === "service";

  return (
    <g style={{ opacity: Math.min(1, amount * 3) }}>
      <g transform={`translate(178 ${y}) scale(${Math.max(0, pop)}) translate(-178 ${-y})`}>
        <circle
          cx="178"
          cy={y}
          r="11"
          fill={isService ? "#0c334d" : "#0f3d46"}
          stroke={isService ? "#38bdf8" : "#2dd4bf"}
          strokeWidth="1.5"
        />
        <path
          d={
            isService
              ? `M174 ${y - 5} A5 5 0 0 0 181 ${y + 2} L185 ${y + 6} M182 ${y - 6} L177 ${y - 1}`
              : `M173 ${y} L177 ${y + 4} L184 ${y - 4}`
          }
          pathLength="100"
          fill="none"
          stroke={isService ? "#7dd3fc" : "#5eead4"}
          strokeWidth={isService ? 2 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100"
          strokeDashoffset={100 - icon * 100}
        />
      </g>
      <path
        d={`M198 ${y} H${lineEnd}`}
        pathLength="100"
        stroke="#155e75"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="100"
        strokeDashoffset={100 - line * 100}
      />
      {pulse && line >= 1 && (
        <circle cx="247" cy={y} r="3" fill="#38bdf8" className="motion-safe:animate-pulse" />
      )}
    </g>
  );
}

export function AutoOsBootAnimation({ progress, onComplete }: AutoOsBootAnimationProps) {
  const target = Math.min(100, Math.max(0, progress));
  const p = useSmoothedProgress(target);

  const printerDraw = easeInOutCubic(phase(p, 0, 36));
  const ledOn = p >= 34;
  const paperProgress = easeOutCubic(phase(p, 34, 60));
  const receivedProgress = phase(p, 46, 64);
  const serviceProgress = phase(p, 60, 80);
  const completedProgress = phase(p, 76, 96);
  const printing = paperProgress > 0 && completedProgress < 1;
  const brandVisible = p >= 100;

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!brandVisible) return;
    const hold = prefersReducedMotion() ? BRAND_HOLD_REDUCED_MS : BRAND_HOLD_MS;
    const t = window.setTimeout(() => onCompleteRef.current?.(), hold);
    return () => window.clearTimeout(t);
  }, [brandVisible]);

  const printerDash = 100 - printerDraw * 100;

  return (
    <div className="boot-stage-in relative w-full max-w-[460px]" aria-hidden="true">
      <svg
        viewBox="0 0 420 320"
        className="h-auto w-full overflow-visible"
        focusable="false"
      >
        <defs>
          <linearGradient id="boot-line" x1="70" y1="45" x2="350" y2="275" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7c9fbd" />
            <stop offset="0.5" stopColor="#4d83ad" />
            <stop offset="1" stopColor="#315f8c" />
          </linearGradient>
          <radialGradient id="boot-glow">
            <stop stopColor="#315f8c" stopOpacity="0.1" />
            <stop offset="1" stopColor="#315f8c" stopOpacity="0" />
          </radialGradient>
          <filter id="boot-soft-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <ellipse
          cx="210"
          cy="166"
          rx="176"
          ry="142"
          fill="url(#boot-glow)"
          className="boot-breathe"
        />

        <g className={cn("boot-equipment", brandVisible && "is-leaving")}>
          <g className="motion-reduce:hidden" opacity={0.8}>
            <path d="M34 112 H76" stroke="#164e63" strokeWidth="1.5" strokeDasharray="3 8" />
            <path d="M344 112 H386" stroke="#164e63" strokeWidth="1.5" strokeDasharray="3 8" />
            <circle cx="38" cy="112" r="2.5" fill="#5f86a5" className="boot-particle" />
            <circle cx="382" cy="112" r="2.5" fill="#4d7294" className="boot-particle boot-particle-delayed" />
            <circle cx="82" cy="64" r="2" fill="#5f86a5" className="boot-orbit-dot" />
            <circle cx="338" cy="252" r="2" fill="#4d7294" className="boot-orbit-dot boot-particle-delayed" />
          </g>

          <g className={cn(printing && "boot-printing")}>
            {/* Brilho do traço: segue o mesmo dashoffset para o desenho parecer "aceso". */}
            <path
              d="M112 92 H308 Q326 92 326 110 V204 Q326 222 308 222 H112 Q94 222 94 204 V110 Q94 92 112 92 Z M144 92 V60 Q144 48 156 48 H264 Q276 48 276 60 V92 M128 196 H292 M128 222 V242 H292 V222"
              pathLength="100"
              fill="none"
              stroke="#4d83ad"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="100"
              strokeDashoffset={printerDash}
              filter="url(#boot-soft-glow)"
              opacity={0.55 * (1 - phase(p, 40, 70) * 0.6)}
              className="motion-reduce:hidden"
            />
            <path
              data-testid="printer-outline"
              d="M112 92 H308 Q326 92 326 110 V204 Q326 222 308 222 H112 Q94 222 94 204 V110 Q94 92 112 92 Z M144 92 V60 Q144 48 156 48 H264 Q276 48 276 60 V92 M128 196 H292 M128 222 V242 H292 V222"
              pathLength="100"
              fill="none"
              stroke="url(#boot-line)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="100"
              strokeDashoffset={printerDash}
            />

            <path
              d="M158 70 H262"
              pathLength="100"
              fill="none"
              stroke="#155e75"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="100"
              strokeDashoffset={100 - easeOutCubic(phase(p, 14, 40)) * 100}
            />

            {ledOn && (
              <circle
                cx="296"
                cy="122"
                r="6"
                fill="none"
                stroke="#5eead4"
                strokeWidth="1.5"
                className="boot-led-ring"
              />
            )}
            <circle
              cx="296"
              cy="122"
              r="6"
              fill={brandVisible || completedProgress >= 1 ? "#2dd4bf" : ledOn ? "#5f86a5" : "#263c50"}
              className={cn(
                "transition-colors duration-300",
                printing && "boot-led-blink",
              )}
            />
          </g>

          {/* Recibo sai da impressora; cada etapa do boot vira uma linha do checklist. */}
          <g
            transform={`translate(0 ${-26 + paperProgress * 26})`}
            style={{ opacity: Math.min(1, paperProgress * 2.5) }}
          >
            <path
              d="M150 178 Q150 168 160 168 H260 Q270 168 270 178 V286 L258 278 L246 286 L234 278 L222 286 L210 278 L198 286 L186 278 L174 286 L162 278 L150 286 Z"
              fill="#071827"
              stroke="#4d83ad"
              strokeWidth="2.5"
            />
            <path
              d="M168 190 H252"
              pathLength="100"
              stroke="#164e63"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="100"
              strokeDashoffset={100 - easeOutCubic(phase(p, 42, 52)) * 100}
            />
            <ChecklistRow y={216} amount={receivedProgress} lineEnd={247} tone="done" />
            <ChecklistRow y={244} amount={serviceProgress} lineEnd={238} tone="service" pulse />
            <ChecklistRow y={272} amount={completedProgress} lineEnd={247} tone="done" />
          </g>
        </g>

        {brandVisible && (
          <g className="boot-brand-in">
            <circle
              cx="210"
              cy="160"
              r="84"
              fill="none"
              stroke="#4d83ad"
              strokeWidth="1.5"
              className="boot-brand-ring motion-reduce:hidden"
            />
            <image
              data-testid="boot-bmitag-logo"
              href="/logo-bmitag.png"
              x="120"
              y="70"
              width="180"
              height="180"
              preserveAspectRatio="xMidYMid meet"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
