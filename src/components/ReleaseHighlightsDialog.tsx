import {
  CheckCircle2,
  Clock,
  FileText,
  MapPin,
  Package,
  Server,
  Sparkles,
  Users,
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
import {
  RELEASE_HIGHLIGHTS_STORAGE_KEY,
  RELEASE_HIGHLIGHTS_VERSION,
} from "@/lib/releaseHighlightsKey";

export { RELEASE_HIGHLIGHTS_STORAGE_KEY, RELEASE_HIGHLIGHTS_VERSION };

const highlights = [
  {
    icon: MapPin,
    title: "Portal mais claro",
    description:
      "O cliente vê o botão \"Como chegar\" e baixa a OS em PDF. Enquanto o orçamento não é publicado, o portal mostra \"Orçamento em preparação\".",
    detail: "O endereço de retirada também aparece no link de status quando o equipamento está pronto.",
  },
  {
    icon: Clock,
    title: "Orçamento sem negociação",
    description:
      "Antes de recusar, o cliente vê o contato da equipe. O prazo para corrigir a resposta caiu de 15 para 10 minutos.",
    detail: "A equipe só aplica a resposta do portal depois desses 10 minutos.",
  },
  {
    icon: Package,
    title: "Menu e orçamento de insumos mais claros",
    description:
      "O menu de ações da OS ficou sem itens repetidos. Orçamento de insumos vencido ganha o selo \"Vencido\" e não pode ser aprovado.",
    detail: "Ao excluir uma peça que está em orçamentos em andamento, o app avisa onde ela é usada.",
  },
  {
    icon: Users,
    title: "Clientes e acesso ao portal",
    description:
      "A busca de clientes encontra pelo contato, e orçamentos pendentes podem ser enviados ao portal em lote.",
    detail: "Na OS, o bloco \"Acesso ao portal\" mostra login e contatos sem exibir senhas.",
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
                Portal mais claro e orçamento sem retrabalho
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300 sm:text-base">
                AutoOS {RELEASE_HIGHLIGHTS_VERSION}: o portal mostra como chegar, a OS em PDF e o orçamento em preparação. O menu de orçamento ficou sem repetição, e o app ficou mais estável na conexão com o banco.
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
              <MapPin className="h-3.5 w-3.5" /> Como chegar no portal
            </Badge>
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 font-normal">
              <FileText className="h-3.5 w-3.5" /> OS em PDF
            </Badge>
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 font-normal">
              <Clock className="h-3.5 w-3.5" /> Correção em 10 min
            </Badge>
            <Badge variant="secondary" className="gap-1.5 px-3 py-1.5 font-normal">
              <Server className="h-3.5 w-3.5" /> Conexão mais estável
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
