import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ATALHOS } from "@/lib/atalhos";

/** Atalhos do app inteiro. Os de cada tela (Esc, Enter, setas) aparecem onde são usados. */
export function ListaAtalhos() {
  return (
    <dl className="space-y-3">
      {ATALHOS.map(({ teclas, acao }) => (
        <div key={acao} className="flex items-center justify-between gap-4">
          <dt className="text-sm">{acao}</dt>
          <dd className="flex shrink-0 gap-1">
            {teclas.map((tecla) => (
              <kbd key={tecla} className="rounded-md border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{tecla}</kbd>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AjudaAtalhos({ aberta, onAbertaChange }: { aberta: boolean; onAbertaChange: (aberta: boolean) => void }) {
  return (
    <Dialog open={aberta} onOpenChange={onAbertaChange}>
      <DialogContent tamanho="p">
        <DialogHeader>
          <DialogTitle>Atalhos</DialogTitle>
          <DialogDescription className="sr-only">Atalhos de teclado do AutoOS</DialogDescription>
        </DialogHeader>
        <ListaAtalhos />
      </DialogContent>
    </Dialog>
  );
}
