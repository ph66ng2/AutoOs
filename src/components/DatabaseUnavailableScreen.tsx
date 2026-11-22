import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, CloudOff, Copy, KeyRound, Server } from "lucide-react";
import { toast } from "sonner";
import { DatabaseConfigDialog } from "@/components/DatabaseConfigDialog";
import {
  ConnectionIcon,
  ConnectionShell,
  ConnectionSpinner,
  cxButton,
  type ConnectionTone,
} from "@/components/database-connection-shell";
import {
  DatabaseConfigService,
  isTransientDatabaseError,
  type DatabaseErrorKind,
  type DatabaseInitError,
} from "@/lib/db-config";
import { versaoDoApp } from "@/lib/error-utils";

/** Espera entre tentativas automáticas, em segundos; a última se repete. */
export const RECONNECT_DELAYS_SECONDS = [5, 10, 20, 30];
/** Com o servidor lotado, nunca tentar antes disto (igual ao backoff do backend). */
export const CAPACITY_MIN_DELAY_SECONDS = 30;

export function reconnectDelaySeconds(attempt: number, tipo: DatabaseErrorKind): number {
  const index = Math.min(attempt, RECONNECT_DELAYS_SECONDS.length - 1);
  const delay = RECONNECT_DELAYS_SECONDS[index];
  return tipo === "capacidade" ? Math.max(delay, CAPACITY_MIN_DELAY_SECONDS) : delay;
}

type FailureKind = Exclude<DatabaseErrorKind, "nao_configurado">;

const COPY: Record<FailureKind, { title: string; description: string }> = {
  rede: {
    title: "Sem conexão com o servidor",
    description: "Confira a internet deste computador. O AutoOS tenta de novo sozinho.",
  },
  capacidade: {
    title: "Servidor ocupado",
    description: "Muitos computadores conectados agora. O AutoOS tenta de novo em instantes.",
  },
  desconhecido: {
    title: "Não foi possível abrir o AutoOS",
    description: "O servidor respondeu algo inesperado. O AutoOS tenta de novo sozinho.",
  },
  credencial: {
    title: "O banco precisa de ajuste",
    description: "A senha ou o endereço salvo foi recusado. Chame o administrador.",
  },
  configuracao_invalida: {
    title: "O banco precisa de ajuste",
    description: "A senha ou o endereço salvo foi recusado. Chame o administrador.",
  },
  incompativel: {
    title: "Banco de outra versão",
    description: "Este AutoOS e o banco estão em versões diferentes. Chame o administrador para atualizar.",
  },
};

function copyFor(tipo: DatabaseErrorKind) {
  return tipo === "nao_configurado" ? COPY.desconhecido : COPY[tipo];
}

function StateIcon({ tipo }: { tipo: DatabaseErrorKind }) {
  const tone: ConnectionTone = isTransientDatabaseError(tipo) ? "wait" : "bad";
  const Icon = tipo === "rede" ? CloudOff : tone === "wait" ? Server : KeyRound;
  return (
    <ConnectionIcon tone={tone}>
      <Icon className="h-[30px] w-[30px]" strokeWidth={2} />
    </ConnectionIcon>
  );
}

/** Texto que o funcionário cola na conversa com o suporte. */
export function supportDetailsText(error: DatabaseInitError, now: Date = new Date(), versao = versaoDoApp()): string {
  const copy = copyFor(error.tipo);
  return [
    `AutoOS: ${copy.title}`,
    `Detalhe: ${error.mensagem}`,
    `Tipo: ${error.tipo}`,
    `Versão: ${versao ?? "desconhecida"}`,
    `Hora: ${now.toLocaleString("pt-BR")}`,
  ].join("\n");
}

interface DatabaseUnavailableScreenProps {
  initialError: DatabaseInitError;
  onConnected: () => void;
  onOpenAdvanced: () => void;
}

export function DatabaseUnavailableScreen({ initialError, onConnected, onOpenAdvanced }: DatabaseUnavailableScreenProps) {
  const [error, setError] = useState(initialError);
  const [reconnecting, setReconnecting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const attemptRef = useRef(0);
  const reconnectingRef = useRef(false);

  const automatic = isTransientDatabaseError(error.tipo);

  const scheduleNext = useCallback((tipo: DatabaseErrorKind) => {
    if (!isTransientDatabaseError(tipo)) {
      setSecondsLeft(null);
      return;
    }
    setSecondsLeft(reconnectDelaySeconds(attemptRef.current, tipo));
    attemptRef.current += 1;
  }, []);

  const reconnect = useCallback(async () => {
    if (reconnectingRef.current) return;
    reconnectingRef.current = true;
    setReconnecting(true);
    setSecondsLeft(null);
    try {
      const next = await DatabaseConfigService.reconnect();
      if (!next) {
        onConnected();
        return;
      }
      setError(next);
      scheduleNext(next.tipo);
    } catch (cause: unknown) {
      const fallback: DatabaseInitError = {
        tipo: "desconhecido",
        mensagem: cause instanceof Error ? cause.message : String(cause || "Falha ao reconectar."),
      };
      setError(fallback);
      scheduleNext(fallback.tipo);
    } finally {
      reconnectingRef.current = false;
      setReconnecting(false);
    }
  }, [onConnected, scheduleNext]);

  const copyDetails = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(supportDetailsText(error));
      toast("Detalhes copiados", {
        description: "Cole na conversa com o suporte.",
        icon: <Check className="h-4 w-4 text-[var(--cx-ok,#3d7a55)]" aria-hidden="true" />,
      });
    } catch {
      toast.error("Não foi possível copiar", { description: "Abra \"Detalhes para o suporte\" e copie o texto à mão." });
      setDetailsOpen(true);
    }
  }, [error]);

  useEffect(() => {
    attemptRef.current = 0;
    scheduleNext(initialError.tipo);
  }, [initialError.tipo, scheduleNext]);

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      void reconnect();
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((value) => (value === null ? null : value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, reconnect]);

  const copy = copyFor(error.tipo);

  const retryButton = (
    <button
      type="button"
      className={`${automatic ? cxButton.primary : cxButton.secondary} ${cxButton.focus}`}
      onClick={() => void reconnect()}
      disabled={reconnecting}
      aria-busy={reconnecting}
    >
      {reconnecting ? (
        <>
          <ConnectionSpinner />
          Conectando...
        </>
      ) : (
        "Tentar novamente"
      )}
    </button>
  );

  return (
    <ConnectionShell
      footer={
        <button
          type="button"
          className={`text-xs font-semibold text-[var(--cx-muted)] hover:text-[var(--cx-ink)] ${cxButton.focus}`}
          onClick={onOpenAdvanced}
        >
          Configuração avançada
        </button>
      }
    >
      <div role="alert" aria-live="assertive" className="flex w-full max-w-[480px] flex-col items-center gap-4 text-center">
        <StateIcon tipo={error.tipo} />
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.01em] [text-wrap:balance]">{copy.title}</h1>
        <p className="m-0 max-w-[40ch] text-[15px] text-[var(--cx-muted)] [text-wrap:pretty]">{copy.description}</p>

        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {automatic ? (
            retryButton
          ) : (
            <>
              <button type="button" className={`${cxButton.primary} ${cxButton.focus}`} onClick={() => void copyDetails()}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copiar detalhes para o suporte
              </button>
              {retryButton}
            </>
          )}
        </div>

        {automatic && (
          <span
            role="timer"
            aria-live="off"
            data-testid={!reconnecting && secondsLeft !== null ? "reconnect-countdown" : undefined}
            className="min-h-[19px] text-[13px] tabular-nums text-[var(--cx-muted)]"
          >
            {!reconnecting && secondsLeft !== null ? `Nova tentativa em ${secondsLeft} s` : "·"}
          </span>
        )}

        <div className="w-full border-t border-[var(--cx-line-soft)] pt-4 text-left">
          <button
            type="button"
            className={`${cxButton.link} h-8 ${cxButton.focus}`}
            aria-expanded={detailsOpen}
            aria-controls="detalhes-suporte"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            Detalhes para o suporte
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${detailsOpen ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          {detailsOpen && (
            <div id="detalhes-suporte" className="mt-2 rounded-xl bg-[var(--cx-sunken)] px-3.5 py-3">
              <code className="block break-words font-mono text-xs leading-normal text-[var(--cx-muted)]">{error.mensagem}</code>
            </div>
          )}
        </div>
      </div>
    </ConnectionShell>
  );
}

type FallbackView =
  | { kind: "loading" }
  | { kind: "setup" }
  | { kind: "unavailable"; error: DatabaseInitError }
  | { kind: "advanced"; error: DatabaseInitError };

/**
 * Decide o que mostrar quando o banco não inicializou: o formulário só quando
 * não há configuração nenhuma; nos demais casos, a tela de reconexão.
 */
export function DatabaseFallback({ onConnected }: { onConnected: () => void }) {
  const [view, setView] = useState<FallbackView>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void DatabaseConfigService.getInitializationError()
      .then((initError) => {
        if (!active) return;
        if (!initError || initError.tipo === "nao_configurado") setView({ kind: "setup" });
        else setView({ kind: "unavailable", error: initError });
      })
      .catch(() => {
        if (active) setView({ kind: "setup" });
      });
    return () => {
      active = false;
    };
  }, []);

  if (view.kind === "loading") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#050608]">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (view.kind === "setup") return <DatabaseConfigDialog onConfigured={onConnected} />;

  if (view.kind === "advanced") {
    return (
      <DatabaseConfigDialog
        onConfigured={onConnected}
        onCancel={() => setView({ kind: "unavailable", error: view.error })}
      />
    );
  }

  return (
    <DatabaseUnavailableScreen
      initialError={view.error}
      onConnected={onConnected}
      onOpenAdvanced={() => setView({ kind: "advanced", error: view.error })}
    />
  );
}
