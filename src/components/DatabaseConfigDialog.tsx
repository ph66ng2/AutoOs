import { useState, useCallback } from "react";
import { Database, ArrowRight, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatabaseConfigService } from "@/lib/db-config";
import type { DatabaseConnectionConfig } from "@/types";

interface DatabaseConfigDialogProps {
  onConfigured: () => void;
}

/** Parseia uma connection string postgresql://user:pass@host:port/database para componentes */
function parseConnectionString(url: string): DatabaseConnectionConfig | null {
  try {
    const regex = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
    const match = url.match(regex);
    if (!match) return null;
    return {
      host: match[3],
      port: parseInt(match[4], 10),
      database: match[5],
      username: match[1],
      password: match[2],
    };
  } catch {
    return null;
  }
}

export function DatabaseConfigDialog({ onConfigured }: DatabaseConfigDialogProps) {
  const [connectionUrl, setConnectionUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleConnect = useCallback(async () => {
    setError(null);
    setSuccess(false);

    const config = parseConnectionString(connectionUrl.trim());
    if (!config) {
      setError("Formato inválido. Use: postgresql://usuario:senha@host:5432/banco");
      return;
    }

    setConnecting(true);
    try {
      const ok = await DatabaseConfigService.test(config);
      if (!ok) {
        setError("Não foi possível conectar. Verifique a URL e tente novamente.");
        setConnecting(false);
        return;
      }

      await DatabaseConfigService.save(config);
      const restarted = await DatabaseConfigService.restartWithConfig(config);
      if (restarted) {
        setSuccess(true);
        setTimeout(() => onConfigured(), 600);
      } else {
        setError("Conexão OK, mas não foi possível reiniciar o app.");
      }
    } catch (e: any) {
      setError(e?.message || "Erro ao conectar ao banco de dados.");
    } finally {
      setConnecting(false);
    }
  }, [connectionUrl, onConfigured]);

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/20">
            <Database className="h-7 w-7 text-cyan-400" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Bem-vindo ao AutoOS</h1>
          <p className="text-sm text-slate-400">
            Conecte ao seu banco de dados PostgreSQL para começar.
          </p>
        </div>

        {/* Card de conexão */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm space-y-5">
          <div className="space-y-2">
            <Label htmlFor="db-url" className="text-sm font-medium text-slate-300">
              URL de Conexão PostgreSQL
            </Label>
            <Input
              id="db-url"
              value={connectionUrl}
              onChange={(e) => {
                setConnectionUrl(e.target.value);
                setError(null);
              }}
              placeholder="postgresql://usuario:senha@host:5432/banco"
              className="h-11 border-white/10 bg-white/5 text-white placeholder:text-white/20 focus-visible:ring-cyan-500/50"
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              autoFocus
            />
            <p className="text-xs text-slate-500">
              Exemplo: postgresql://postgres:senha@db.supabase.co:5432/postgres
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <span>Conectado com sucesso! Abrindo o app...</span>
            </div>
          )}

          <Button
            size="lg"
            className="w-full bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-semibold h-11"
            onClick={() => void handleConnect()}
            disabled={connecting || !connectionUrl.trim() || success}
          >
            {connecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Conectando...
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Conectar ao Banco
              </>
            )}
          </Button>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600">
          O banco de dados será inicializado automaticamente na primeira conexão.
        </p>
      </div>
    </div>
  );
}
