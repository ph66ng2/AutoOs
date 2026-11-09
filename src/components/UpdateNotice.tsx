import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UpdateChecker } from "@/components/UpdateChecker";

/** Primeira consulta depois da abertura (não disputa o boot) e depois a cada 6 h. */
export const UPDATE_NOTICE_FIRST_CHECK_MS = 15_000;
export const UPDATE_NOTICE_INTERVAL_MS = 6 * 60 * 60 * 1_000;

/**
 * Aviso de nova versão para qualquer pessoa. A consulta é silenciosa (sem rede, nada aparece);
 * a instalação continua sendo uma ação explícita, no mesmo painel de Configurações › Banco.
 * "Depois" esconde o aviso daquela versão até o app ser aberto de novo.
 */
export function UpdateNotice() {
  const [version, setVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Fechar no meio do download desmontaria o painel com a instalação em andamento.
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isTauri()) {
      return;
    }
    let cancelled = false;
    const consultar = async () => {
      try {
        const update = await check();
        if (!update) {
          return;
        }
        if (!cancelled) setVersion(update.version);
        // O painel faz a própria consulta; esta só serve para avisar.
        await update.close?.().catch(() => undefined);
      } catch {
        // Sem rede ou manifesto indisponível: tenta de novo no próximo intervalo.
      }
    };
    const first = window.setTimeout(() => void consultar(), UPDATE_NOTICE_FIRST_CHECK_MS);
    const interval = window.setInterval(() => void consultar(), UPDATE_NOTICE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);

  if (!version) {
    return null;
  }

  return (
    <>
      {dismissed !== version && !open ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-40 flex max-w-sm items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-lg"
        >
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium">AutoOS {version} disponível</p>
            <p className="text-xs text-muted-foreground">Atualize quando puder. O app fecha e reabre sozinho.</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setOpen(true)}>
                Ver e atualizar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(version)}>
                Depois
              </Button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar aviso de atualização"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setDismissed(version)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={(next) => { if (next || !installing) setOpen(next); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Atualizar o AutoOS</DialogTitle>
            <DialogDescription>
              Salve o que estiver fazendo antes de instalar: o AutoOS fecha e reabre na versão nova.
            </DialogDescription>
          </DialogHeader>
          {open ? <UpdateChecker autoCheck onBusyChange={setInstalling} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
