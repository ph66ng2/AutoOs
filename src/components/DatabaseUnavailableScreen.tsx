import { useCallback, useEffect, useRef, useState } from "react";
import { CloudOff, Loader2, RefreshCw, ServerCrash, Settings2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatabaseConfigDialog } from "@/components/DatabaseConfigDialog";
import {
  DatabaseConfigService,
  isTransientDatabaseError,
  type DatabaseErrorKind,
  type DatabaseInitError,
} from "@/lib/db-config";

/** Espera entre tentativas automáticas, em segundos; a última se repete. */
export const RECONNECT_DELAYS_SECONDS = [5, 10, 20, 30];
/** Com o servidor lotado, nunca tentar antes disto (igual ao backoff do backend). */
export const CAPACITY_MIN_DELAY_SECONDS = 30;

export function reconnectDelaySeconds(attempt: number, tipo: DatabaseErrorKind): number {
  const index = Math.min(attempt, RECONNECT_DELAYS_SECONDS.length - 1);
  const delay = RECONNECT_DELAYS_SECONDS[index];
  return tipo === "capacidade" ? Math.max(delay, CAPACITY_MIN_DELAY_SECONDS) : delay;
}

const COPY: Record<DatabaseErrorKind, { title: string; description: string }> = {
  rede: {
    title: "Sem conexão com o servidor",
    description: "Verifique a internet deste computador. O AutoOS tenta conectar de novo sozinho.",
  },
  capacidade: {
    title: "Servidor ocupado",
    description: "O servidor atingiu o limite de conexões. O AutoOS tenta de novo em instantes.",
  },
  desconhecido: {
    title: "Não foi possível abrir o AutoOS",
    description: "O servidor não respondeu como esperado. O AutoOS tenta conectar de novo sozinho.",
  },
  credencial: {
    title: "A configuração do banco precisa de ajuste",
    description: "O servidor recusou o acesso. Isso não se resolve sozinho: chame o administrador do sistema.",
  },
  configuracao_invalida: {
    title: "A configuração do banco precisa de ajuste",
    description: "O endereço do banco salvo neste computador é inválido. Chame o administrador do sistema.",
  },
  incompativel: {
    title: "Banco incompatível com esta versão",
    description: "Esta versão do AutoOS não reconhece o banco configurado. Chame o administrador do sistema.",
  },
  nao_configurado: {
    title: "Banco não configurado",
    description: "Este computador ainda não tem um banco configurado.",
  },
};

interface DatabaseUnavailableScreenProps {
  initialError: DatabaseInitError;
  onConnected: () => void;
  onOpenAdvanced: () => void;
}

export function DatabaseUnavailableScreen({ initialError, onConnected, onOpenAdvanced }: DatabaseUnavailableScreenProps) {
  const [error, setError] = useState(initialError);
  const [reconnecting, setReconnecting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
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

  const copy = COPY[error.tipo] ?? COPY.desconhecido;
  const Icon = automatic ? (error.tipo === "rede" ? CloudOff : ServerCrash) : Wrench;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md space-y-6" role="alert" aria-live="polite">
        <div className="space-y-2 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/10">
            <Icon className="h-7 w-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{copy.title}</h1>
          <p className="text-sm text-slate-400">{copy.description}</p>
        </div>

        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <p className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
            <span className="font-medium text-slate-200">Detalhe: </span>
            {error.mensagem}
          </p>

          <Button
            size="lg"
            className="h-11 w-full bg-cyan-500 font-semibold text-slate-950 hover:bg-cyan-400"
            onClick={() => void reconnect()}
            disabled={reconnecting}
          >
            {reconnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Tentar novamente
              </>
            )}
          </Button>

          {!reconnecting && secondsLeft !== null && (
            <p className="text-center text-xs text-slate-400" data-testid="reconnect-countdown">
              Nova tentativa automática em {secondsLeft} s
            </p>
          )}
        </div>

        <div className="text-center">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
            onClick={onOpenAdvanced}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configuração avançada (suporte)
          </button>
        </div>
      </div>
    </div>
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
