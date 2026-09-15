interface AutoOsBootAnimationProps {
  progress: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const phase = (progress: number, start: number, end: number) =>
  clamp01((progress - start) / (end - start));

export function bootStatusLabel(progress: number): string {
  if (progress >= 100) return "Tudo pronto";
  if (progress >= 86) return "Finalizando o atendimento";
  if (progress >= 38) return "Preparando sua sessão";
  if (progress >= 14) return "Carregando módulos";
  return "Iniciando o AutoOS";
}

export function AutoOsBootAnimation({ progress }: AutoOsBootAnimationProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const printerDraw = phase(clamped, 0, 38);
  const paperProgress = phase(clamped, 34, 58);
  const receivedProgress = phase(clamped, 44, 62);
  const serviceProgress = phase(clamped, 58, 82);
  const completedProgress = phase(clamped, 78, 92);
  const brandProgress = phase(clamped, 94, 100);
  const equipmentOpacity = 1 - brandProgress;

  return (
    <div className="relative w-full max-w-[460px]" aria-hidden="true">
      <svg
        viewBox="0 0 420 320"
        className="h-auto w-full overflow-visible"
        focusable="false"
      >
        <defs>
          <linearGradient id="boot-line" x1="70" y1="45" x2="350" y2="275" gradientUnits="userSpaceOnUse">
            <stop stopColor="#67e8f9" />
            <stop offset="0.5" stopColor="#0ea5e9" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="boot-brand" x1="105" y1="120" x2="315" y2="180" gradientUnits="userSpaceOnUse">
            <stop stopColor="#67e8f9" />
            <stop offset="0.52" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#3b82f6" />
          </linearGradient>
          <radialGradient id="boot-glow">
            <stop stopColor="#22d3ee" stopOpacity="0.22" />
            <stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </radialGradient>
          <filter id="boot-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <ellipse cx="210" cy="166" rx="176" ry="142" fill="url(#boot-glow)" />

        <g className="motion-reduce:hidden" opacity={equipmentOpacity * 0.8}>
          <path d="M34 112 H76" stroke="#164e63" strokeWidth="1.5" strokeDasharray="3 8" />
          <path d="M344 112 H386" stroke="#164e63" strokeWidth="1.5" strokeDasharray="3 8" />
          <circle cx="38" cy="112" r="3" fill="#22d3ee" className="boot-particle" />
          <circle cx="382" cy="112" r="3" fill="#38bdf8" className="boot-particle boot-particle-delayed" />
          <circle cx="82" cy="64" r="2.5" fill="#22d3ee" className="boot-orbit-dot" />
          <circle cx="338" cy="252" r="2.5" fill="#60a5fa" className="boot-orbit-dot boot-particle-delayed" />
        </g>

        <g
          style={{ opacity: equipmentOpacity }}
          className="transition-opacity delay-700 duration-500 ease-out motion-reduce:delay-0"
        >
          <path
            data-testid="printer-outline"
            d="M112 92 H308 Q326 92 326 110 V204 Q326 222 308 222 H112 Q94 222 94 204 V110 Q94 92 112 92 Z M144 92 V60 Q144 48 156 48 H264 Q276 48 276 60 V92 M128 196 H292 M128 222 V242 H292 V222"
            pathLength="100"
            fill="none"
            stroke="url(#boot-line)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="100"
            style={{ strokeDashoffset: 100 - printerDraw * 100 }}
            className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
            filter="url(#boot-soft-glow)"
          />

          <path
            d="M158 70 H262"
            pathLength="100"
            fill="none"
            stroke="#155e75"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="100"
            style={{ strokeDashoffset: 100 - printerDraw * 100 }}
            className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
          />

          <circle
            cx="296"
            cy="122"
            r="6"
            fill={clamped >= 38 ? "#22d3ee" : "#164e63"}
            className="transition-colors duration-300"
          />

          <g
            transform={`translate(0 ${-22 + paperProgress * 22})`}
            style={{ opacity: paperProgress }}
            className="transition-opacity duration-500 ease-out motion-reduce:transition-none"
          >
            <path
              d="M150 178 Q150 168 160 168 H260 Q270 168 270 178 V286 L258 278 L246 286 L234 278 L222 286 L210 278 L198 286 L186 278 L174 286 L162 278 L150 286 Z"
              fill="#071827"
              stroke="#38bdf8"
              strokeWidth="2.5"
              filter="url(#boot-soft-glow)"
            />
            <path d="M168 190 H252" stroke="#164e63" strokeWidth="2" strokeLinecap="round" />

            <g
              style={{ opacity: receivedProgress }}
              className="transition-opacity delay-150 duration-300 motion-reduce:transition-none"
            >
              <circle cx="178" cy="216" r="11" fill="#0f3d46" stroke="#2dd4bf" strokeWidth="1.5" />
              <path d="M173 216 L177 220 L184 212" fill="none" stroke="#5eead4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M198 216 H247" stroke="#155e75" strokeWidth="3" strokeLinecap="round" />
            </g>

            <g
              style={{ opacity: serviceProgress }}
              className="transition-opacity delay-300 duration-300 motion-reduce:transition-none"
            >
              <circle cx="178" cy="244" r="11" fill="#0c334d" stroke="#38bdf8" strokeWidth="1.5" />
              <path d="M174 239 A5 5 0 0 0 181 246 L185 250 M182 238 L177 243" fill="none" stroke="#7dd3fc" strokeWidth="2" strokeLinecap="round" />
              <path d="M198 244 H238" stroke="#155e75" strokeWidth="3" strokeLinecap="round" />
              <circle cx="247" cy="244" r="3" fill="#38bdf8" className="motion-safe:animate-pulse" />
            </g>

            <g
              style={{ opacity: completedProgress }}
              className="transition-opacity delay-500 duration-300 motion-reduce:transition-none"
            >
              <circle cx="178" cy="272" r="11" fill="#0f3d46" stroke="#2dd4bf" strokeWidth="1.5" />
              <path d="M173 272 L177 276 L184 268" fill="none" stroke="#5eead4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M198 272 H247" stroke="#155e75" strokeWidth="3" strokeLinecap="round" />
            </g>
          </g>
        </g>

        <g
          style={{ opacity: brandProgress }}
          className="transition-opacity delay-700 duration-500 ease-out motion-reduce:transition-none"
          filter="url(#boot-soft-glow)"
        >
          <text
            x="210"
            y="158"
            textAnchor="middle"
            fill="url(#boot-brand)"
            fontFamily="Inter, Segoe UI, sans-serif"
            fontSize="50"
            fontWeight="800"
            letterSpacing="5"
          >
            AUTOOS
          </text>
          <path d="M132 178 H288" stroke="#164e63" strokeWidth="1.5" />
          <text
            x="210"
            y="204"
            textAnchor="middle"
            fill="#7895ad"
            fontFamily="Inter, Segoe UI, sans-serif"
            fontSize="13"
            fontWeight="600"
            letterSpacing="4"
          >
            BY BMITAG
          </text>
        </g>
      </svg>
    </div>
  );
}
