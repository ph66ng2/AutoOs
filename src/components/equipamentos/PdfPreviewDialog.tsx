import { useEffect, useMemo, useRef } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PdfArtifact } from "@/lib/pdf-service";

/** Prévia A4 no WebView; a persistência no backend permanece opcional e separada. */
export function PdfPreviewDialog({ artifact, onOpenChange }: { artifact: PdfArtifact | null; onOpenChange: (open: boolean) => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const url = useMemo(() => artifact ? URL.createObjectURL(new Blob([new Uint8Array(artifact.bytes).buffer], { type: artifact.mimeType })) : null, [artifact]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  function print() {
    const frameWindow = frameRef.current?.contentWindow;
    if (frameWindow) frameWindow.print();
    else window.print();
  }

  return <Dialog open={Boolean(artifact)} onOpenChange={onOpenChange}><DialogContent className="h-[96vh] max-w-[96vw] p-4"><DialogHeader><DialogTitle className="text-xl">Prévia A4 — {artifact?.filename}</DialogTitle></DialogHeader><div className="min-h-0 flex-1 overflow-hidden border bg-slate-200"><iframe ref={frameRef} title="Prévia da ordem de serviço" src={url || undefined} className="h-full min-h-[75vh] w-full bg-white" /></div><div className="flex justify-end"><Button className="min-h-12 gap-2 text-base" onClick={print}><Printer /> Imprimir</Button></div></DialogContent></Dialog>;
}
