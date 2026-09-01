import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PdfArtifact } from "@/lib/pdf-service";

/** Prévia A4 no WebView; a persistência no backend permanece opcional e separada. */
interface PdfPreviewDialogProps {
  artifact: PdfArtifact | null;
  onOpenChange: (open: boolean) => void;
  /** Persiste o arquivo somente quando a pessoa solicitar o download. */
  onDownload?: (artifact: PdfArtifact) => Promise<void> | void;
}

export function PdfPreviewDialog({ artifact, onOpenChange, onDownload }: PdfPreviewDialogProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [downloading, setDownloading] = useState(false);
  const url = useMemo(() => artifact ? URL.createObjectURL(new Blob([new Uint8Array(artifact.bytes).buffer], { type: artifact.mimeType })) : null, [artifact]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  function print() {
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow) frameWindow.print();
    else window.print();
  }

  async function download() {
    if (!artifact || !onDownload) return;
    setDownloading(true);
    try {
      await onDownload(artifact);
    } finally {
      setDownloading(false);
    }
  }

  return <Dialog open={Boolean(artifact)} onOpenChange={onOpenChange}><DialogContent className="h-[96vh] max-w-[96vw] p-4"><DialogHeader><DialogTitle className="text-xl">Prévia A4 — {artifact?.filename}</DialogTitle></DialogHeader><div className="min-h-0 flex-1 overflow-hidden border bg-slate-200"><iframe ref={frameRef} title="Prévia do PDF" src={url || undefined} className="h-full min-h-[75vh] w-full bg-white" /></div><div className="flex justify-end gap-2">{onDownload && <Button variant="outline" className="min-h-12 gap-2 text-base" disabled={downloading} onClick={() => void download()}>{downloading ? <Loader2 className="animate-spin" /> : <Download />} Baixar</Button>}<Button className="min-h-12 gap-2 text-base" onClick={print}><Printer /> Imprimir</Button></div></DialogContent></Dialog>;
}
