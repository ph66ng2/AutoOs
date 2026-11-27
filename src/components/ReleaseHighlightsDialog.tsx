import { Check, ChevronDown, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReleaseHighlights } from "@/hooks/useReleaseHighlights";
import { getReleaseHighlightsContent } from "@/lib/release-highlights-content";

/** Quantas novidades aparecem de cara; o resto fica em "Ver mais". */
export const NOVIDADES_VISIVEIS = 5;

/**
 * Novidades da versão: uma lista curta para quem usa, não um changelog.
 * Só as primeiras aparecem; o resto abre em "Ver mais" para quem quiser.
 */
export function ReleaseHighlightsDialog({ enabled }: { enabled: boolean }) {
  const { version, open, dismiss } = useReleaseHighlights(enabled);
  const content = getReleaseHighlightsContent(version ?? "");
  const primeiras = content.highlights.slice(0, NOVIDADES_VISIVEIS);
  const resto = content.highlights.slice(NOVIDADES_VISIVEIS);

  const item = ({ title }: { title: string }) => (
    <li key={title} className="flex items-start gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="text-sm leading-relaxed text-foreground">{title}</span>
    </li>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      {/* Modal padrão do app: cabeçalho e rodapé em faixa, só o meio rola. */}
      <DialogContent tamanho="m" className="flex max-h-[min(85vh,680px)] flex-col gap-0 overflow-hidden [&>button]:hidden">
        <DialogHeader className="relative">
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Fechar novidades"
              className="absolute right-3 top-3 h-9 w-9 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </DialogClose>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle>{content.title}</DialogTitle>
              <p className="text-xs font-medium text-muted-foreground">Versão {version}</p>
            </div>
          </div>
          <DialogDescription className="pt-2">{content.description}</DialogDescription>
        </DialogHeader>

        <DialogBody>
          {primeiras.length > 0 && <ul className="grid gap-3">{primeiras.map(item)}</ul>}
          {resto.length > 0 && (
            <details className="group mt-4 border-t pt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-primary [&::-webkit-details-marker]:hidden">
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                {resto.length === 1 ? "Ver mais 1 novidade" : `Ver mais ${resto.length} novidades`}
              </summary>
              <ul className="mt-3 grid gap-3">{resto.map(item)}</ul>
            </details>
          )}
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" className="sm:min-w-40">
              Começar a usar
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
