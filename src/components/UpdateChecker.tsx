import { useCallback, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { AlertCircle, CheckCircle2, Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";

export type UpdaterPhase =
  | "unavailable"
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "installing"
  | "error";

type CheckerState = {
  phase: UpdaterPhase;
  currentVersion: string | null;
  availableVersion: string | null;
  notes: string;
  error: string | null;
  retry: "check" | "install" | null;
  downloaded: number;
  total: number | null;
  windowsInstallHint: string | null;
};

const INITIAL_STATE: CheckerState = {
  phase: "idle",
  currentVersion: null,
  availableVersion: null,
  notes: "",
  error: null,
  retry: null,
  downloaded: 0,
  total: null,
  windowsInstallHint: null,
};

const BUSY_PHASES: UpdaterPhase[] = ["checking", "downloading", "installing"];

export function isUpdaterBusy(phase: UpdaterPhase): boolean {
  return BUSY_PHASES.includes(phase);
}

export function sanitizeUpdateNotes(raw: string | undefined | null): string {
  if (!raw) {
    return "";
  }
  const withoutTags = raw.replace(/<[^>]*>/g, " ");
  const collapsed = withoutTags.replace(/\s+/g, " ").trim();
  if (/postgres(ql)?:\/\//i.test(collapsed) || /TAURI_SIGNING|Bearer\s+[A-Za-z0-9._-]+/i.test(collapsed)) {
    return "";
  }
  return collapsed.slice(0, 400);
}

export function classifyUpdaterError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error ?? "");
  const lower = text.toLowerCase();
  if (!text.trim() || text === "undefined" || text === "null") {
    return "Não foi possível verificar atualizações.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network") ||
    lower.includes("offline") ||
    lower.includes("dns") ||
    lower.includes("econnrefused") ||
    lower.includes("internet")
  ) {
    return "Falha de rede ao consultar atualizações. Verifique a conexão e tente novamente.";
  }
  if (/\b(401|403|404|408|429|500|502|503|504)\b/.test(lower) || lower.includes("http") || lower.includes("status code")) {
    return "O servidor de atualizações respondeu com erro HTTP.";
  }
  if (lower.includes("json") || lower.includes("parse") || lower.includes("manifest") || lower.includes("unexpected token")) {
    return "O manifesto de atualização está inválido.";
  }
  if (lower.includes("platform") || lower.includes("windows-x86_64") || lower.includes("no update for this target")) {
    return "Não há pacote de atualização para esta plataforma.";
  }
  if (lower.includes("signature") || lower.includes("minisign") || lower.includes("pubkey") || lower.includes("checksum")) {
    return "A assinatura da atualização foi rejeitada. O instalador atual não foi substituído.";
  }
  if (lower.includes("install") || lower.includes("elevation") || lower.includes("privileg")) {
    return "A instalação da atualização foi rejeitada.";
  }
  return `Não foi possível concluir a atualização. ${text.slice(0, 180)}`;
}

function createMockableUpdate(update: Update): Update {
  return update;
}

export function UpdateChecker() {
  const [state, setState] = useState<CheckerState>(INITIAL_STATE);
  const updateRef = useRef<Update | null>(null);
  const busyRef = useRef(false);

  const setPhase = useCallback((patch: Partial<CheckerState> & Pick<CheckerState, "phase">) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    if (!isTauri()) {
      setPhase({ phase: "unavailable", error: null });
      return;
    }
    let cancelled = false;
    void getVersion()
      .then((version) => {
        if (!cancelled) {
          setState((current) => ({
            ...current,
            currentVersion: version,
            phase: current.phase === "unavailable" ? "idle" : current.phase,
          }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState((current) => ({ ...current, phase: current.phase === "unavailable" ? "idle" : current.phase }));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setPhase]);

  const checkForUpdates = useCallback(async () => {
    if (!isTauri()) {
      setPhase({ phase: "unavailable", error: null, retry: null });
      return;
    }
    if (busyRef.current) {
      return;
    }
    busyRef.current = true;
    updateRef.current = null;
    setPhase({
      phase: "checking",
      error: null,
      retry: null,
      availableVersion: null,
      notes: "",
      windowsInstallHint: null,
    });
    try {
      const update = await check();
      if (!update) {
        setPhase({
          phase: "upToDate",
          availableVersion: null,
          notes: "",
          error: null,
          retry: null,
        });
        return;
      }
      updateRef.current = createMockableUpdate(update);
      setPhase({
        phase: "available",
        currentVersion: update.currentVersion || state.currentVersion,
        availableVersion: update.version,
        notes: sanitizeUpdateNotes(update.body),
        error: null,
        retry: null,
      });
    } catch (error) {
      updateRef.current = null;
      setPhase({
        phase: "error",
        error: classifyUpdaterError(error),
        retry: "check",
        availableVersion: null,
        notes: "",
      });
    } finally {
      busyRef.current = false;
    }
  }, [setPhase, state.currentVersion]);

  const downloadAndInstall = useCallback(async () => {
    const update = updateRef.current;
    if (!update || busyRef.current || !isTauri()) {
      return;
    }
    busyRef.current = true;
    setPhase({
      phase: "downloading",
      error: null,
      retry: null,
      downloaded: 0,
      total: null,
      windowsInstallHint: null,
    });
    try {
      let downloaded = 0;
      let total: number | null = null;
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          downloaded = 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
        } else if (event.event === "Finished") {
          downloaded = total ?? downloaded;
        }
        setPhase({
          phase: "downloading",
          downloaded,
          total,
          availableVersion: update.version,
          notes: sanitizeUpdateNotes(update.body),
          error: null,
          retry: null,
        });
      });
      setPhase({
        phase: "installing",
        availableVersion: update.version,
        windowsInstallHint:
          "O instalador do Windows pode encerrar o AutoOS. Se o aplicativo não reabrir, inicie-o de novo.",
      });
      try {
        await relaunch();
      } catch {
        setPhase({
          phase: "installing",
          availableVersion: update.version,
          windowsInstallHint:
            "Atualização instalada. O instalador pode ter encerrado o processo; abra o AutoOS novamente se a janela não voltar.",
        });
      }
    } catch (error) {
      setPhase({
        phase: "error",
        error: classifyUpdaterError(error),
        retry: "install",
        availableVersion: update.version,
        notes: sanitizeUpdateNotes(update.body),
      });
    } finally {
      busyRef.current = false;
    }
  }, [setPhase]);

  const onPrimary = useCallback(() => {
    if (state.phase === "available" || (state.phase === "error" && state.retry === "install")) {
      void downloadAndInstall();
      return;
    }
    void checkForUpdates();
  }, [checkForUpdates, downloadAndInstall, state.phase, state.retry]);

  if (state.phase === "unavailable") {
    return (
      <div className="space-y-2" data-testid="update-checker">
        <p className="text-sm font-medium">Atualizações do AutoOS</p>
        <p className="text-xs text-muted-foreground">
          Verificação de atualizações indisponível neste ambiente (navegador ou testes sem runtime Tauri).
        </p>
      </div>
    );
  }

  const busy = isUpdaterBusy(state.phase);
  const percent =
    state.total && state.total > 0 ? Math.min(100, Math.round((state.downloaded / state.total) * 100)) : null;
  const primaryLabel =
    state.phase === "checking"
      ? "Verificando..."
      : state.phase === "downloading"
        ? "Baixando..."
        : state.phase === "installing"
          ? "Instalando..."
          : state.phase === "available"
            ? "Baixar e instalar"
            : state.phase === "error"
              ? "Tentar novamente"
              : "Verificar";

  return (
    <div className="space-y-3" data-testid="update-checker">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Atualizações do AutoOS</p>
          {state.currentVersion ? (
            <p className="text-xs text-muted-foreground">Versão instalada: {state.currentVersion}</p>
          ) : (
            <p className="text-xs text-muted-foreground">Verifique se há novas versões disponíveis.</p>
          )}
          {state.phase === "upToDate" ? (
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              Esta é a versão mais recente após uma consulta bem-sucedida.
            </p>
          ) : null}
          {state.phase === "available" || state.phase === "downloading" || state.phase === "installing" ? (
            <div className="space-y-1">
              {state.availableVersion ? (
                <p className="text-xs font-medium">Nova versão: {state.availableVersion}</p>
              ) : null}
              {state.notes ? <p className="text-xs text-muted-foreground whitespace-pre-wrap">{state.notes}</p> : null}
            </div>
          ) : null}
        </div>
        <Button
          variant={state.phase === "available" ? "default" : "outline"}
          size="sm"
          onClick={onPrimary}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : state.phase === "available" ? (
            <Download className="mr-2 h-4 w-4" />
          ) : state.phase === "error" ? (
            <RefreshCw className="mr-2 h-4 w-4" />
          ) : state.phase === "upToDate" ? (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          ) : (
            <AlertCircle className="mr-2 h-4 w-4" />
          )}
          {primaryLabel}
        </Button>
      </div>

      {state.phase === "downloading" ? (
        <div className="space-y-1">
          <div
            role="progressbar"
            aria-label="Download da atualização"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
            className="h-2 w-full overflow-hidden rounded bg-muted"
          >
            {percent !== null ? (
              <div className="h-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse bg-primary/70" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {percent !== null ? `Baixando ${percent}%` : "Baixando (tamanho indeterminado)"}
          </p>
        </div>
      ) : null}

      {state.windowsInstallHint ? (
        <ErrorAlert variant="info" message={state.windowsInstallHint} />
      ) : null}

      {state.phase === "error" && state.error ? (
        <ErrorAlert variant="error" context="Atualização" message={state.error} />
      ) : null}
    </div>
  );
}
