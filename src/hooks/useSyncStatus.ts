import { useState, useEffect, useRef, useCallback } from "react";
import { powerSyncDb } from "@/lib/powersync/client";
import type { SyncStatus } from "@powersync/web";

export type SyncState = "connected" | "syncing" | "disconnected" | "error";

export interface UseSyncStatusReturn {
  status: SyncState;
  lastSyncedAt: Date | null;
  pendingUploads: number;
  pendingDownloads: number;
  error: string | null;
  statusMessage: string;
}

function deriveSyncState(syncStatus: SyncStatus): {
  state: SyncState;
  message: string;
} {
  const message = syncStatus.getMessage();

  if (syncStatus.uploading || syncStatus.downloading) {
    return { state: "syncing", message };
  }

  if (syncStatus.connecting) {
    return { state: "syncing", message };
  }

  if (syncStatus.downloadError || syncStatus.uploadError) {
    return { state: "error", message };
  }

  if (syncStatus.connected) {
    return { state: "connected", message };
  }

  return { state: "disconnected", message };
}

export function useSyncStatus(): UseSyncStatusReturn {
  const [status, setStatus] = useState<SyncState>("disconnected");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [pendingUploads, setPendingUploads] = useState(0);
  const [pendingDownloads, setPendingDownloads] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const disposeRef = useRef<(() => void) | null>(null);

  const handleStatusChange = useCallback((syncStatus: SyncStatus) => {
    const { state, message } = deriveSyncState(syncStatus);

    setStatus(state);
    setStatusMessage(message);

    const syncedAt = syncStatus.lastSyncedAt;
    if (syncedAt) {
      setLastSyncedAt(new Date(syncedAt));
    }

    const syncError = syncStatus.downloadError ?? syncStatus.uploadError;
    if (syncError) {
      setError(syncError.message || "Erro de sincronização");
    } else {
      setError(null);
    }

    powerSyncDb().getUploadQueueStats(false).then((stats) => {
      setPendingUploads(stats?.count ?? 0);
    }).catch(() => {
      setPendingUploads(0);
    });

    const progress = syncStatus.downloadProgress;
    if (progress && progress.totalOperations != null) {
      const remaining = progress.totalOperations - progress.downloadedOperations;
      setPendingDownloads(Math.max(0, remaining));
    } else {
      setPendingDownloads(0);
    }
  }, []);

  useEffect(() => {
    const dispose = powerSyncDb().registerListener({
      statusChanged: handleStatusChange,
    });
    disposeRef.current = dispose;

    const currentStatus = powerSyncDb().currentStatus;
    if (currentStatus) {
      handleStatusChange(currentStatus);
    }

    return () => {
      disposeRef.current?.();
      disposeRef.current = null;
    };
  }, [handleStatusChange]);

  return {
    status,
    lastSyncedAt,
    pendingUploads,
    pendingDownloads,
    error,
    statusMessage,
  };
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "agora mesmo";
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffHr < 24) return `há ${diffHr}h`;
  if (diffDay < 7) return `há ${diffDay}d`;
  return date.toLocaleDateString("pt-BR");
}
