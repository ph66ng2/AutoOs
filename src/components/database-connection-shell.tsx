import type { CSSProperties, ReactNode } from "react";

import "@fontsource-variable/manrope";
import "@fontsource/ibm-plex-mono/500.css";

/**
 * As telas de conexão usam os tokens globais da direção B (`src/index.css`),
 * que já trocam sozinhos entre claro e escuro pela classe `.dark`. Os nomes
 * `--cx-*` só apontam para eles; nenhuma cor é definida aqui.
 */
const TOKENS: Record<string, string> = {
  "--cx-bg": "hsl(var(--background))",
  "--cx-surface": "hsl(var(--card))",
  "--cx-sunken": "hsl(var(--muted))",
  "--cx-line": "hsl(var(--border))",
  "--cx-line-soft": "hsl(var(--border))",
  "--cx-ink": "hsl(var(--foreground))",
  "--cx-muted": "hsl(var(--muted-foreground))",
  "--cx-ctl": "hsl(var(--ctl))",
  "--cx-acc": "hsl(var(--primary))",
  "--cx-acc-ink": "hsl(var(--primary-foreground))",
  "--cx-track": "hsl(var(--track))",
  "--cx-danger": "hsl(var(--destructive))",
  "--cx-ok": "hsl(var(--st-ok))",
  "--cx-ok-bg": "hsl(var(--st-ok-bg))",
  "--cx-field-border": "hsl(var(--input))",
  "--cx-wait": "hsl(var(--st-wait))",
  "--cx-wait-bg": "hsl(var(--st-wait-bg))",
  "--cx-bad": "hsl(var(--st-bad))",
  "--cx-bad-bg": "hsl(var(--st-bad-bg))",
  "--cx-neutral": "hsl(var(--st-neutral))",
  "--cx-neutral-bg": "hsl(var(--st-neutral-bg))",
};

/** Fontes da direção B: Manrope em tudo, IBM Plex Mono para códigos. */
const FONTS: Record<string, string> = {
  "--cx-mono": "'IBM Plex Mono', ui-monospace, Consolas, monospace",
  fontFamily: "'Manrope Variable', 'Manrope', 'Segoe UI', system-ui, sans-serif",
};

/** Sombra só no que flutua (menu, aviso). */
export const CX_SHADOW_FLOAT = "shadow-[0_12px_32px_rgba(0,0,0,0.18)]";

/** Tokens e fontes das telas de conexão, como variáveis CSS (`--cx-*`). */
export function useConnectionThemeVars(): CSSProperties {
  return { ...TOKENS, ...FONTS } as CSSProperties;
}

export type ConnectionTone = "wait" | "bad" | "neutral";

const TONE_CLASS: Record<ConnectionTone, string> = {
  wait: "bg-[var(--cx-wait-bg)] text-[var(--cx-wait)]",
  bad: "bg-[var(--cx-bad-bg)] text-[var(--cx-bad)]",
  neutral: "bg-[var(--cx-neutral-bg)] text-[var(--cx-neutral)]",
};

/** Botões do canvas: primário cheio, secundário com contorno, link discreto. */
export const cxButton = {
  primary:
    "inline-flex h-11 min-w-[200px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[var(--cx-acc)] px-4 text-sm font-bold text-[var(--cx-acc-ink)] disabled:cursor-not-allowed disabled:bg-[var(--cx-track)] disabled:text-[var(--cx-muted)]",
  secondary:
    "inline-flex h-11 min-w-[200px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-transparent px-4 text-sm font-bold text-[var(--cx-ink)] shadow-[inset_0_0_0_1px_var(--cx-ctl)] disabled:cursor-not-allowed disabled:text-[var(--cx-muted)]",
  link: "inline-flex items-center gap-1.5 bg-transparent text-[13px] font-bold text-[var(--cx-muted)] hover:text-[var(--cx-ink)] disabled:cursor-not-allowed",
  focus: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cx-acc)]",
};

export function ConnectionIcon({ tone, children }: { tone: ConnectionTone; children: ReactNode }) {
  return (
    <span aria-hidden="true" className={`grid h-16 w-16 shrink-0 place-items-center rounded-[20px] ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

/** Indicador de carregamento; com movimento reduzido gira mais devagar. */
export function ConnectionSpinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:[animation-duration:1.6s]"
    />
  );
}

interface ConnectionShellProps {
  children: ReactNode;
  footer?: ReactNode;
}

/** Fundo, marca no canto e rodapé comuns às telas de conexão. */
export function ConnectionShell({ children, footer }: ConnectionShellProps) {
  const vars = useConnectionThemeVars();

  return (
    <div
      style={vars}
      className="fixed inset-0 z-[9998] flex items-center justify-center overflow-y-auto bg-[var(--cx-bg)] px-4 py-20 text-sm text-[var(--cx-ink)]"
    >
      <div className="absolute left-3 top-1">
        <img src="/logo-tag-trasparente.svg" alt="BMI TAG" className="h-[72px] w-auto" />
      </div>
      {children}
      {footer && <div className="absolute bottom-5 left-0 right-0 flex justify-center">{footer}</div>}
    </div>
  );
}
