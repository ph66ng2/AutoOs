import {
  CheckCircle2,
  QrCode,
  Smartphone,
  Sparkles,
  WifiOff,
  X,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const RELEASE_HIGHLIGHTS_VERSION = "0.5.6";
export const RELEASE_HIGHLIGHTS_STORAGE_KEY =
  `autoos:release-highlights:${RELEASE_HIGHLIGHTS_VERSION}:fotos-celular`;

const highlights = [
  {
    icon: Smartphone,
    title: "Foto pelo celular no 4G",
    description:
      "O QR de sempre agora pode abrir um endereço HTTPS. O celular não precisa estar no Wi-Fi da recepção.",
    detail: "O AutoOS sobe um túnel temporário só enquanto o diálogo de foto estiver aberto.",
  },
  {
    icon: QrCode,
    title: "Três PCs ao mesmo tempo",
    description:
      "Cada computador gera o próprio endereço. Os três da recepção podem mandar foto juntos.",
    detail: "Não usa o hostname único fotos.bmitag.com.br. Cada QR vale só naquele PC, naquele momento.",
  },
  {
    icon: WifiOff,
    title: "cloudflared no PC",
    description:
      "Uma vez: copie o cloudflared.exe para o PATH ou para a pasta AutoOS em Dados de aplicativos.",
    detail: "Sem o executável, o QR continua no IP da rede local, como nas versões anteriores.",
  },
] as const;

function hasSeenReleaseHighlights(): boolean {
  try {
    return window.localStorage.getItem(RELEASE_HIGHLIGHTS_STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

function markReleaseHighlightsAsSeen(): void {
  try {
    window.localStorage.setItem(RELEASE_HIGHLIGHTS_STORAGE_KEY, "seen");
  } catch {
    // O aviso continua dispensável mesmo quando o armazenamento local não está disponível.
  }
}

export function ReleaseHighlightsDialog({ enabled }: { enabled: boolean }) {
  const [dismissed, setDismissed] = useState(hasSeenReleaseHighlights);
  const shouldShow = enabled && !dismissed;

  const dismiss = () => {
    markReleaseHighlightsAsSeen();
    setDismissed(true);
  };

  return (
    <Dialog
      open={shouldShow}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent className="grid max-h-[90vh] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden border-0 p-0 shadow-2xl sm:max-w-4xl [&>button]:hidden">
        <DialogHeader className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 px-6 pb-6 pt-7 text-left text-white sm:px-8 sm:pb-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-blue-500/15 blur-3xl" />
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Fechar novidades"
              className="absolute right-4 top-4 z-10 text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <X />
            </Button>
          </DialogClose>

          <div className="relative flex flex-wrap items-center gap-2">
            <Badge className="border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/10">
              Versão {RELEASE_HIGHLIGHTS_VERSION}
            </Badge>
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
              Atualização estável
            </span>
          </div>
          <div className="relative mt-5 flex items-start gap-4">
            <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-300 sm:flex">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
                Fotos pelo celular sem depender do Wi-Fi
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                AutoOS 0.5.6: o QR de fotos usa HTTPS temporário. Os três PCs podem enviar ao mesmo tempo, e o celular pode estar no 4G.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="overflow-y-auto bg-background px-6 py-6 sm:px-8">
          <div className="grid gap-4 md:grid-cols-2">
            {highlights.map(({ icon: Icon, title, description, detail }) => (
              <article
                key={title}
                className="group rounded-2xl border bg-card p-5 shadow-sm transition-colors hover:border-cyan-500/40"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>{detail}</span>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-2" aria-label="Outras melhorias da versão">
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 font-normal">
              <Smartphone className="h-3.5 w-3.5" /> QR HTTPS temporário
            </Badge>
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 font-normal">
              <QrCode className="h-3.5 w-3.5" /> Três PCs em paralelo
            </Badge>
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 font-normal">
              <WifiOff className="h-3.5 w-3.5" /> Celular no 4G
            </Badge>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t bg-muted/30 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p className="text-xs text-muted-foreground">
            Este resumo aparece uma única vez nesta máquina para a versão {RELEASE_HIGHLIGHTS_VERSION}.
          </p>
          <DialogClose asChild>
            <Button type="button" className="min-w-40 bg-cyan-600 hover:bg-cyan-500">
              Começar a usar
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
