import { Wifi, WifiOff, RefreshCw, AlertTriangle } from "lucide-react";
import { useSyncStatus, formatRelativeTime, type SyncState } from "@/hooks/useSyncStatus";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const statusConfig: Record<SyncState, { icon: typeof Wifi; color: string; label: string; srLabel: string }> = {
  connected: {
    icon: Wifi,
    color: "text-green-500",
    label: "Conectado",
    srLabel: "Sincronização conectada",
  },
  syncing: {
    icon: RefreshCw,
    color: "text-blue-500",
    label: "Sincronizando",
    srLabel: "Sincronização em andamento",
  },
  disconnected: {
    icon: WifiOff,
    color: "text-yellow-500",
    label: "Desconectado",
    srLabel: "Sincronização desconectada",
  },
  error: {
    icon: AlertTriangle,
    color: "text-red-500",
    label: "Erro",
    srLabel: "Erro de sincronização",
  },
};

interface SyncStatusIndicatorProps {
  /** Se true, mostra o indicador mesmo quando conectado sem pendências */
  alwaysShow?: boolean;
}

export function SyncStatusIndicator({ alwaysShow = false }: SyncStatusIndicatorProps) {
  const { status, lastSyncedAt, pendingUploads, pendingDownloads, error } = useSyncStatus();

  const config = statusConfig[status];
  const Icon = config.icon;
  const totalPending = pendingUploads + pendingDownloads;

  // Auto-hide when connected and no pending changes
  if (!alwaysShow && status === "connected" && totalPending === 0) {
    return null;
  }

  const pendingLabel = totalPending > 0 ? `${totalPending} alteração(ões) pendente(s)` : null;
  const lastSyncLabel = lastSyncedAt ? `Última sincronização: ${formatRelativeTime(lastSyncedAt)}` : null;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="inline-flex items-center gap-1.5 text-xs cursor-default"
            role="status"
            aria-live="polite"
            aria-label={config.srLabel}
          >
            <Icon
              className={`h-3.5 w-3.5 ${config.color} ${status === "syncing" ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span className="text-muted-foreground">{config.label}</span>
            {pendingLabel && <span className="text-muted-foreground">· {pendingLabel}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="end" className="space-y-1 text-xs">
          <div className="font-medium">{config.label}</div>
          {lastSyncLabel && <div className="text-muted-foreground">{lastSyncLabel}</div>}
          {pendingUploads > 0 && (
            <div className="text-muted-foreground">{pendingUploads} envio(s) pendente(s)</div>
          )}
          {pendingDownloads > 0 && (
            <div className="text-muted-foreground">{pendingDownloads} download(s) pendente(s)</div>
          )}
          {error && <div className="text-red-500">{error}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
