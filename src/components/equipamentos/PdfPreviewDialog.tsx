import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PRAZO_EXECUCAO_PADRAO, type PdfArtifact } from "@/lib/pdf-service";

/** Prévia A4 no WebView; a persistência no backend permanece opcional e separada. */
interface PdfPreviewDialogProps {
  artifact: PdfArtifact | null;
  onOpenChange: (open: boolean) => void;
  /** Persiste o arquivo somente quando a pessoa solicitar o download. */
  onDownload?: (artifact: PdfArtifact) => Promise<void> | void;
  /** Só na prévia de orçamento: ajusta o prazo impresso neste PDF, sem gravar no cadastro. */
  prazoExecucao?: {
    minDiasUteis: number;
    maxDiasUteis: number;
    updating?: boolean;
    onChange: (minDiasUteis: number, maxDiasUteis: number) => PdfArtifact | void | Promise<PdfArtifact | void>;
  };
}

function normalizarPrazo(minimo: number, maximo: number) {
  const minOk = Number.isFinite(minimo) ? Math.min(90, Math.max(1, Math.round(minimo))) : PRAZO_EXECUCAO_PADRAO.minDiasUteis;
  const maxOk = Number.isFinite(maximo) ? Math.min(90, Math.max(minOk, Math.round(maximo))) : Math.max(minOk, PRAZO_EXECUCAO_PADRAO.maxDiasUteis);
  return { minDiasUteis: minOk, maxDiasUteis: maxOk };
}

export function PdfPreviewDialog({ artifact, onOpenChange, onDownload, prazoExecucao }: PdfPreviewDialogProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const printAfterLoadRef = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [prazoMin, setPrazoMin] = useState(String(prazoExecucao?.minDiasUteis ?? PRAZO_EXECUCAO_PADRAO.minDiasUteis));
  const [prazoMax, setPrazoMax] = useState(String(prazoExecucao?.maxDiasUteis ?? PRAZO_EXECUCAO_PADRAO.maxDiasUteis));
  const url = useMemo(
    () => artifact ? URL.createObjectURL(new Blob([new Uint8Array(artifact.bytes).buffer], { type: artifact.mimeType })) : null,
    [artifact],
  );

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => { setPreviewReady(false); }, [url]);
  useEffect(() => {
    if (!prazoExecucao) return;
    setPrazoMin(String(prazoExecucao.minDiasUteis));
    setPrazoMax(String(prazoExecucao.maxDiasUteis));
  }, [prazoExecucao?.minDiasUteis, prazoExecucao?.maxDiasUteis]);

  useEffect(() => {
    if (!previewReady || !printAfterLoadRef.current) return;
    printAfterLoadRef.current = false;
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.focus();
    window.setTimeout(() => frameWindow.print(), 0);
  }, [previewReady]);

  async function aplicarPrazo(): Promise<PdfArtifact | null> {
    if (!prazoExecucao) return artifact;
    const normalizado = normalizarPrazo(Number(prazoMin), Number(prazoMax));
    setPrazoMin(String(normalizado.minDiasUteis));
    setPrazoMax(String(normalizado.maxDiasUteis));
    if (
      normalizado.minDiasUteis === prazoExecucao.minDiasUteis
      && normalizado.maxDiasUteis === prazoExecucao.maxDiasUteis
    ) {
      return artifact;
    }
    const atualizado = await prazoExecucao.onChange(normalizado.minDiasUteis, normalizado.maxDiasUteis);
    return atualizado || artifact;
  }

  function imprimirIframe() {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.focus();
    window.setTimeout(() => frameWindow.print(), 0);
  }

  async function print() {
    if (!prazoExecucao) {
      imprimirIframe();
      return;
    }
    const normalizado = normalizarPrazo(Number(prazoMin), Number(prazoMax));
    const mudou =
      normalizado.minDiasUteis !== prazoExecucao.minDiasUteis
      || normalizado.maxDiasUteis !== prazoExecucao.maxDiasUteis;
    if (!mudou) {
      imprimirIframe();
      return;
    }
    printAfterLoadRef.current = true;
    await aplicarPrazo();
  }

  async function download() {
    if (!onDownload) return;
    setDownloading(true);
    try {
      const atual = await aplicarPrazo();
      if (atual) await onDownload(atual);
    } finally {
      setDownloading(false);
    }
  }

  const ocupado = downloading || Boolean(prazoExecucao?.updating);

  return (
    <Dialog open={Boolean(artifact)} onOpenChange={onOpenChange}>
      <DialogContent className="h-[96vh] max-w-[96vw] p-4">
        <DialogHeader>
          <DialogTitle className="text-xl">Prévia A4 — {artifact?.filename}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden border bg-slate-200">
          <iframe
            ref={frameRef}
            title="Prévia do PDF"
            src={url || undefined}
            className="h-full min-h-[75vh] w-full bg-white"
            onLoad={() => setPreviewReady(true)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {onDownload && (
            <Button variant="outline" className="min-h-12 gap-2 text-base" disabled={ocupado} onClick={() => void download()}>
              {downloading ? <Loader2 className="animate-spin" /> : <Download />} Baixar
            </Button>
          )}
          <Button className="min-h-12 gap-2 text-base" disabled={!previewReady || ocupado} onClick={() => void print()}>
            {prazoExecucao?.updating ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir
          </Button>
          {prazoExecucao && (
            <div className="flex items-center gap-2 text-sm">
              <span className="whitespace-nowrap text-muted-foreground">Prazo</span>
              <Input
                type="number"
                min={1}
                max={90}
                inputMode="numeric"
                aria-label="Prazo mínimo em dias úteis"
                className="h-12 w-16 tabular-nums text-center"
                value={prazoMin}
                disabled={ocupado}
                onChange={(event) => setPrazoMin(event.target.value)}
                onBlur={() => { void aplicarPrazo(); }}
              />
              <span className="text-muted-foreground">a</span>
              <Input
                type="number"
                min={1}
                max={90}
                inputMode="numeric"
                aria-label="Prazo máximo em dias úteis"
                className="h-12 w-16 tabular-nums text-center"
                value={prazoMax}
                disabled={ocupado}
                onChange={(event) => setPrazoMax(event.target.value)}
                onBlur={() => { void aplicarPrazo(); }}
              />
              <span className="whitespace-nowrap text-muted-foreground">dias úteis</span>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
