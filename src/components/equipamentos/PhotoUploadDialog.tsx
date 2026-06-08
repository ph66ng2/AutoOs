import { useState, useCallback, useEffect, useRef } from "react";
import { Smartphone, Clock, AlertCircle, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { db } from "@/lib/db";

const PHOTO_SERVER_PORT = 8765;
const TOKEN_TTL_SECONDS = 600;
const POLL_INTERVAL_MS = 3000;

interface PhotoUploadDialogProps {
  equipamentoId: number;
  categoria: "ENTRADA" | "SAIDA";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPhotoUploaded: () => void;
}

interface QrData {
  qr_svg: string;
  url: string;
  token: string;
}

export function PhotoUploadDialog({
  equipamentoId,
  categoria,
  open,
  onOpenChange,
  onPhotoUploaded,
}: PhotoUploadDialogProps) {
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [timer, setTimer] = useState(TOKEN_TTL_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stopServer = useCallback(async () => {
    cleanup();
    try {
      await db.stopPhotoServer();
    } catch {
      // Server may already be stopped
    }
    setQrData(null);
    setTimer(TOKEN_TTL_SECONDS);
    setError(null);
    setLoading(false);
  }, [cleanup]);

  const startServer = useCallback(async () => {
    setLoading(true);
    setError(null);
    setQrData(null);
    setTimer(TOKEN_TTL_SECONDS);

    try {
      await db.startPhotoServer(PHOTO_SERVER_PORT);
      const result = await db.gerarQrUpload(equipamentoId, categoria, PHOTO_SERVER_PORT);
      setQrData(result);
    } catch {
      setError("Não foi possível iniciar o servidor de fotos");
      return;
    } finally {
      setLoading(false);
    }

    timerRef.current = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          cleanup();
          setError("Token expirado. Gere um novo QR code.");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    pollRef.current = setInterval(async () => {
      if (!qrData?.token) return;
      try {
        const res = await fetch(`http://localhost:${PHOTO_SERVER_PORT}/status/${qrData.token}`);
        const data = await res.json();
        if (data.used) {
          cleanup();
          await stopServer();
          onPhotoUploaded();
          onOpenChange(false);
        }
      } catch {
        // Polling error - ignore, will retry
      }
    }, POLL_INTERVAL_MS);
  }, [equipamentoId, categoria, cleanup, stopServer, onPhotoUploaded, onOpenChange, qrData?.token]);

  useEffect(() => {
    if (open) {
      void startServer();
    } else {
      void stopServer();
    }
    return () => {
      cleanup();
    };
  }, [open, startServer, stopServer, cleanup]);

  const handleRegenerate = useCallback(() => {
    void stopServer();
    setTimeout(() => {
      void startServer();
    }, 100);
  }, [stopServer, startServer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      void stopServer();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Adicionar Foto via Celular
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR code com seu celular ou acesse o endereço abaixo
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="text-sm text-muted-foreground">Iniciando servidor...</p>
          </div>
        )}

        {error && !qrData && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm text-red-600 text-center">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRegenerate}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Tentar novamente
            </Button>
          </div>
        )}

        {error && qrData && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm text-red-600 text-center">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRegenerate}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Gerar novo QR code
            </Button>
          </div>
        )}

        {qrData && !error && (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div
                className="border rounded-lg p-4 bg-white"
                dangerouslySetInnerHTML={{ __html: qrData.qr_svg }}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Endereço para acesso manual:</p>
              <code className="block text-xs bg-muted px-2 py-1 rounded break-all">
                {qrData.url}
              </code>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Expira em {formatTime(timer)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
            <X className="h-4 w-4 mr-1" />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
