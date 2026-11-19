import { useEffect, useState } from "react";
import { Check, CloudOff, KeyRound, Server } from "lucide-react";
import { ConnectionSpinner, cxButton, useConnectionThemeVars } from "@/components/database-connection-shell";
import { useDatabaseHealth, type DatabaseHealth } from "@/hooks/useDatabaseHealth";
import { failureCopy, longOutageMessage } from "@/lib/database-reconnect";
import { isTransientDatabaseError } from "@/lib/db-config";

/**
 * Aviso de conexão com o app já aberto. Fica no topo, por cima das telas, sem
 * desmontar nada: o que estava digitado continua lá quando a conexão volta.
 */
export function DatabaseConnectionAlert() {
  const { health, tentarAgora } = useDatabaseHealth();
  return <DatabaseConnectionAlertView health={health} onRetry={tentarAgora} />;
}

interface DatabaseConnectionAlertViewProps {
  health: DatabaseHealth;
  onRetry: () => void;
}

export function DatabaseConnectionAlertView({ health, onRetry }: DatabaseConnectionAlertViewProps) {
  const vars = useConnectionThemeVars();
  const [now, setNow] = useState(() => Date.now());
  const down = health.status === "caiu";

  useEffect(() => {
    if (!down) return;
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [down]);

  if (health.status === "ok") return null;

  const shell = "fixed left-1/2 top-3 z-[70] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 rounded-xl border bg-[var(--cx-surface)] p-3 pr-4 text-sm text-[var(--cx-ink)] shadow-lg";

  if (health.status === "restabelecida") {
    return (
      <div style={vars} role="status" className={`${shell} flex items-center gap-3 border-[var(--cx-line-soft)]`}>
        <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--cx-ok)]">
          <Check className="h-4 w-4" />
        </span>
        <strong className="font-bold">Conexão restabelecida</strong>
      </div>
    );
  }

  const { error, reconnecting, secondsLeft, downSince } = health;
  const automatic = isTransientDatabaseError(error.tipo);
  const copy = failureCopy(error.tipo);
  const Icon = error.tipo === "rede" ? CloudOff : automatic ? Server : KeyRound;
  const tone = automatic
    ? "bg-[var(--cx-wait-bg)] text-[var(--cx-wait)]"
    : "bg-[var(--cx-bad-bg)] text-[var(--cx-bad)]";
  const longOutage = automatic ? longOutageMessage(downSince, now) : null;

  return (
    <div
      style={vars}
      role="alert"
      aria-live="assertive"
      className={`${shell} flex items-start gap-3 ${automatic ? "border-[var(--cx-wait)]" : "border-[var(--cx-bad)]"}`}
    >
      <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block font-bold">{copy.title}</strong>
        <span className="block text-[13px] text-[var(--cx-muted)]">
          {automatic ? "O que você digitou continua aqui. Salve de novo quando a conexão voltar." : copy.description}
        </span>
        {longOutage && <span className="mt-0.5 block text-[13px] text-[var(--cx-muted)]">{longOutage}</span>}
        {automatic && (
          <span role="timer" aria-live="off" className="mt-0.5 block text-xs tabular-nums text-[var(--cx-muted)]">
            {reconnecting ? "Conectando..." : secondsLeft !== null ? `Nova tentativa em ${secondsLeft} s` : "·"}
          </span>
        )}
      </div>
      <button
        type="button"
        className={`inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-transparent px-3 text-[13px] font-bold text-[var(--cx-ink)] shadow-[inset_0_0_0_1px_var(--cx-ctl)] disabled:cursor-not-allowed disabled:text-[var(--cx-muted)] ${cxButton.focus}`}
        onClick={onRetry}
        disabled={reconnecting}
        aria-busy={reconnecting}
      >
        {reconnecting ? <ConnectionSpinner /> : null}
        Tentar agora
      </button>
    </div>
  );
}
