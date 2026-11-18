import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "next-themes";

/**
 * Cores das telas de conexão com o banco, tiradas do canvas de redesign
 * (pranchetas "Conexão com o banco", direção B). Ficam restritas a estas telas
 * até o redesign chegar ao resto do app.
 */
const DARK: Record<string, string> = {
  "--cx-bg": "#0a0c10",
  "--cx-surface": "#12161c",
  "--cx-sunken": "#151a21",
  "--cx-line-soft": "#1b2129",
  "--cx-ink": "#e6e9ee",
  "--cx-muted": "#9aa3ae",
  "--cx-ctl": "#2c3540",
  "--cx-acc": "#7aa9b5",
  "--cx-acc-ink": "#0c1416",
  "--cx-track": "#2a323c",
  "--cx-danger": "#d58a84",
  "--cx-ok": "#7fb08f",
  "--cx-field-border": "#56677a",
  "--cx-wait": "#cfac6e",
  "--cx-wait-bg": "#2a2318",
  "--cx-bad": "#d58a84",
  "--cx-bad-bg": "#2c1b1a",
  "--cx-neutral": "#9aa3ae",
  "--cx-neutral-bg": "#1b2027",
};

const LIGHT: Record<string, string> = {
  "--cx-bg": "#f4f5f6",
  "--cx-surface": "#ffffff",
  "--cx-sunken": "#eef1f4",
  "--cx-line-soft": "#e1e5ea",
  "--cx-ink": "#1d242c",
  "--cx-muted": "#5d6673",
  "--cx-ctl": "#cfd5dc",
  "--cx-acc": "#1f5e6e",
  "--cx-acc-ink": "#ffffff",
  "--cx-track": "#e3e7ec",
  "--cx-danger": "#a8443f",
  "--cx-ok": "#3d7a55",
  "--cx-field-border": "#7f8ea1",
  "--cx-wait": "#8a6420",
  "--cx-wait-bg": "#f5eddc",
  "--cx-bad": "#a8443f",
  "--cx-bad-bg": "#f6e8e6",
  "--cx-neutral": "#5f6772",
  "--cx-neutral-bg": "#eceef1",
};

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
  const { resolvedTheme } = useTheme();
  const vars = (resolvedTheme === "light" ? LIGHT : DARK) as CSSProperties;

  return (
    <div
      style={vars}
      className="fixed inset-0 z-[9998] flex items-center justify-center overflow-y-auto bg-[var(--cx-bg)] px-4 py-20 text-sm text-[var(--cx-ink)]"
    >
      <div className="absolute left-7 top-6 flex items-center gap-2.5">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--cx-acc)] text-[13px] font-extrabold text-[var(--cx-acc-ink)]">
          OS
        </span>
        <b>AutoOS</b>
      </div>
      {children}
      {footer && <div className="absolute bottom-5 left-0 right-0 flex justify-center">{footer}</div>}
    </div>
  );
}
