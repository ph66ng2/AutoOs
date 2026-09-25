import { useState, useCallback, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { Smartphone, Clock, AlertCircle, RefreshCw, X, Copy, Check, CheckCircle2 } from "lucide-react";
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
const POLL_INTERVAL_MS = 1000;
const SUCCESS_VISIBLE_MS = 2200;

interface PhotoUploadData {
  bytes: number[];
  filename: string;
  mime_type: string;
  categoria: string;
}

interface PhotoUploadDialogProps {
  equipamentoId: number;
  categoria: "ENTRADA" | "SAIDA" | "VERIFICACAO";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPhotoUploaded: () => void;
  onPhotoData?: (data: PhotoUploadData) => void;
}

interface QrData {
  qr_svg: string;
  url: string;
  token: string;
  via_tunnel?: boolean;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function PhotoUploadDialog({
  equipamentoId,
  categoria,
  open,
  onOpenChange,
  onPhotoUploaded,
  onPhotoData,
}: PhotoUploadDialogProps) {
  const [qrData, setQrData] = useState<QrData | null>(null);
  const [timer, setTimer] = useState(TOKEN_TTL_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRef = useRef<string | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledRef = useRef(false);

  const openRef = useRef(open);
  const onPhotoUploadedRef = useRef(onPhotoUploaded);
  const onOpenChangeRef = useRef(onOpenChange);
  const onPhotoDataRef = useRef(onPhotoData);
  const categoriaRef = useRef(categoria);
  const equipamentoIdRef = useRef(equipamentoId);

  // Sync refs with latest props
  useEffect(() => {
    openRef.current = open;
    onPhotoUploadedRef.current = onPhotoUploaded;
    onOpenChangeRef.current = onOpenChange;
    onPhotoDataRef.current = onPhotoData;
    categoriaRef.current = categoria;
    equipamentoIdRef.current = equipamentoId;
  });

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
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
    tokenRef.current = null;
    setTimer(TOKEN_TTL_SECONDS);
    setError(null);
    setLoading(false);
    setCopied(false);
  }, [cleanup]);

  const finishSuccess = useCallback(
    async (countHint?: number) => {
      if (handledRef.current) return;
      handledRef.current = true;
      cleanup();

      let count = countHint && countHint > 0 ? countHint : 1;
      const token = tokenRef.current;
      let imageData:
        | Array<{ bytes: number[]; filename: string; mime_type: string }>
        | undefined;

      if (token) {
        try {
          const status = await db.consultarStatusFoto(token);
          if (status.count > 0) count = status.count;
          imageData = status.image_data;
        } catch {
          // Evento já basta para mostrar o overlay
        }
      }

      if (onPhotoDataRef.current && imageData && imageData.length > 0) {
        count = imageData.length;
        for (const img of imageData) {
          onPhotoDataRef.current({
            bytes: img.bytes,
            filename: img.filename,
            mime_type: img.mime_type,
            categoria: categoriaRef.current,
          });
        }
      } else {
        onPhotoUploadedRef.current();
      }

      setSuccessCount(count);
      setSuccess(true);
      successTimeoutRef.current = setTimeout(() => {
        onOpenChangeRef.current(false);
      }, SUCCESS_VISIBLE_MS);
    },
    [cleanup],
  );

  const startServer = useCallback(async () => {
    handledRef.current = false;
    setSuccess(false);
    setSuccessCount(0);
    setLoading(true);
    setError(null);
    setQrData(null);
    tokenRef.current = null;
    setTimer(TOKEN_TTL_SECONDS);

    try {
      await db.startPhotoServer(PHOTO_SERVER_PORT);
      const result = await db.gerarQrUpload(equipamentoIdRef.current, categoriaRef.current, PHOTO_SERVER_PORT);
      setQrData(result);
      tokenRef.current = result.token;
    } catch (error) {
      const message = typeof error === "string" ? error : (error as { message?: string })?.message;
      setError(message || "Não foi possível iniciar o servidor de fotos");
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

    const pollOnce = () => {
      const token = tokenRef.current;
      if (!token) return;
      void db
        .consultarStatusFoto(token)
        .then((data) => {
          if (data.used) {
            return finishSuccess(data.count);
          }
        })
        .catch(() => {
          // Polling error - ignore, will retry
        });
    };
    pollOnce();
    pollRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
  }, [cleanup, finishSuccess]);

  useEffect(() => {
    if (openRef.current) {
      void startServer();
    } else {
      void stopServer();
    }
    return () => {
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<{ equipamento_id?: number; count?: number }>("photo-received", (event) => {
      const id = event.payload?.equipamento_id;
      if (id !== undefined && id !== equipamentoIdRef.current) return;
      void finishSuccess(event.payload?.count);
    })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch(() => {
        // Sem Tauri (testes / e2e mock) o poll IPC continua válido
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [open, finishSuccess]);

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

  const viaTunnel = !!qrData?.via_tunnel || !!qrData?.url.startsWith("https://");
  const namedHost = !!qrData?.url.includes("fotos.bmitag.com.br");

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      void stopServer();
    }
    onOpenChange(newOpen);
  };

  const handleCopyUrl = async () => {
    if (!qrData?.url) return;
    try {
      await navigator.clipboard.writeText(qrData.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      void db.abrirUrl(qrData.url);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] w-[min(100%,360px)] gap-3 overflow-y-auto p-4 sm:max-w-[360px] sm:p-5">
        <DialogHeader className="space-y-1">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Smartphone className="h-5 w-5" />
            Foto pelo celular
          </DialogTitle>
          <DialogDescription>
            {viaTunnel
              ? "Escaneie com o celular. Pode usar 4G — não precisa do Wi-Fi da recepção."
              : "Escaneie o QR. O celular precisa estar no mesmo Wi-Fi do computador."}
          </DialogDescription>
        </DialogHeader>

        {success && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-green-800">Fotos recebidas</p>
            <p className="text-sm text-muted-foreground">
              {successCount} {successCount === 1 ? "foto" : "fotos"} no equipamento
            </p>
          </div>
        )}

        {loading && !success && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="text-sm text-muted-foreground">Preparando o endereço do celular...</p>
          </div>
        )}

        {!success && error && !qrData && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm text-red-600 text-center">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRegenerate}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Tentar novamente
            </Button>
          </div>
        )}

        {!success && error && qrData && (
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="text-sm text-red-600 text-center">{error}</p>
            <Button variant="outline" size="sm" onClick={handleRegenerate}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Gerar novo QR code
            </Button>
          </div>
        )}

        {!success && qrData && !error && (
          <div className="space-y-3">
            <div className="mx-auto flex h-[220px] w-[220px] items-center justify-center overflow-hidden rounded-xl bg-white p-2 outline outline-1 outline-[oklch(0_0_0/0.1)]">
              <div
                data-testid="qr-frame"
                className="h-full w-full [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: qrData.qr_svg }}
              />
            </div>

            <div className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5">
              <p
                className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground"
                title={qrData.url}
              >
                {hostFromUrl(qrData.url)}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => { void handleCopyUrl(); }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only">{copied ? "Copiado" : "Copiar endereço"}</span>
              </Button>
            </div>

            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Expira em {formatTime(timer)}</span>
            </div>

            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800">
                {viaTunnel
                  ? namedHost
                    ? "Este PC responde por fotos.bmitag.com.br enquanto o QR estiver aberto. Um computador por vez."
                    : "O celular pode estar no 4G. Este endereço vale só enquanto o QR estiver aberto neste computador."
                  : "O celular precisa estar no mesmo Wi-Fi do computador."}
              </p>
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
