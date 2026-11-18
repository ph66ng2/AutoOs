import { useState, useCallback } from "react";
import { Database } from "lucide-react";
import { ConnectionIcon, ConnectionShell, ConnectionSpinner, cxButton } from "@/components/database-connection-shell";
import { DatabaseConfigService, parsePostgresConnectionUrl } from "@/lib/db-config";

interface DatabaseConfigDialogProps {
  onConfigured: () => void;
  /** Quando aberto a partir da tela de reconexão, permite voltar para ela. */
  onCancel?: () => void;
}

export function DatabaseConfigDialog({ onConfigured, onCancel }: DatabaseConfigDialogProps) {
  const [connectionUrl, setConnectionUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const support = Boolean(onCancel);

  const handleConnect = useCallback(async () => {
    setError(null);
    setSuccess(false);

    const config = parsePostgresConnectionUrl(connectionUrl);
    if (!config) {
      setError("Formato inválido. Cole uma URL postgres:// ou postgresql:// completa.");
      return;
    }

    setConnecting(true);
    try {
      const restarted = await DatabaseConfigService.restartWithConfig(config);
      if (restarted) {
        setSuccess(true);
        setTimeout(() => onConfigured(), 600);
      } else {
        setError("Conexão OK, mas não foi possível reiniciar o app.");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e || "Erro ao conectar ao banco de dados."));
    } finally {
      setConnecting(false);
    }
  }, [connectionUrl, onConfigured]);

  return (
    <ConnectionShell>
      <form
        className="flex w-full max-w-[520px] flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleConnect();
        }}
      >
        <div className="flex items-center gap-3.5">
          <ConnectionIcon tone="neutral">
            <Database className="h-[30px] w-[30px]" strokeWidth={2} />
          </ConnectionIcon>
          <div>
            <h1 className="m-0 text-2xl font-bold">{support ? "Configuração de suporte" : "Conectar o AutoOS a um banco"}</h1>
            <p className="m-0 mt-0.5 text-[var(--cx-muted)]">
              {support ? "Use só se o suporte pediu." : "Cole a URL do banco para começar."}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-[13px] font-bold">
          <label htmlFor="db-url">URL do banco</label>
          <input
            id="db-url"
            value={connectionUrl}
            onChange={(e) => {
              setConnectionUrl(e.target.value);
              setError(null);
            }}
            placeholder="postgresql://usuario:senha@host:5432/postgres?sslmode=require"
            aria-invalid={error ? true : undefined}
            aria-describedby="db-url-ajuda"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className={`h-11 w-full rounded-lg border bg-[var(--cx-surface)] px-3 font-mono text-[13px] font-medium text-[var(--cx-ink)] placeholder:text-[var(--cx-muted)] ${cxButton.focus} ${
              error ? "border-2 border-[var(--cx-danger)]" : "border-[var(--cx-field-border)]"
            }`}
          />
          {error ? (
            <span id="db-url-ajuda" role="alert" className="font-semibold text-[var(--cx-danger)]">
              {error}
            </span>
          ) : success ? (
            <span id="db-url-ajuda" role="status" className="font-semibold text-[var(--cx-ok)]">
              Conectado. Abrindo o AutoOS...
            </span>
          ) : (
            <span id="db-url-ajuda" className="font-medium text-[var(--cx-muted)]">
              No Supabase, use a URL do Session pooler (porta 5432), terminando em /postgres?sslmode=require.
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {onCancel && (
            <button
              type="button"
              className={`${cxButton.link} h-9 text-[14px] text-[var(--cx-acc)] ${cxButton.focus}`}
              onClick={onCancel}
              disabled={connecting}
            >
              <span aria-hidden="true">‹</span> Voltar e tentar com a configuração atual
            </button>
          )}
          <button
            type="submit"
            className={`${cxButton.primary} ml-auto min-w-0 ${cxButton.focus}`}
            disabled={connecting || !connectionUrl.trim() || success}
            aria-busy={connecting}
          >
            {connecting ? (
              <>
                <ConnectionSpinner />
                Conectando...
              </>
            ) : (
              "Conectar ao banco"
            )}
          </button>
        </div>
      </form>
    </ConnectionShell>
  );
}
