import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GUIA_ATALHOS, OBSERVACAO_ATALHOS } from "@/lib/atalhos";

/** Guia de atalhos agrupado por onde cada um vale. Usado no "?" e em Perfil › Tutorial. */
export function ListaAtalhos() {
  return (
    <div className="space-y-5">
      {GUIA_ATALHOS.map((grupo) => (
        <section key={grupo.titulo} aria-label={grupo.titulo} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground">{grupo.titulo}</h3>
          <dl className="space-y-2">
            {grupo.atalhos.map(({ teclas, acao }) => (
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
        </section>
      ))}
    </div>
  );
}

export function AjudaAtalhos({ aberta, onAbertaChange }: { aberta: boolean; onAbertaChange: (aberta: boolean) => void }) {
  return (
    <Dialog open={aberta} onOpenChange={onAbertaChange}>
      <DialogContent tamanho="g">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>{OBSERVACAO_ATALHOS}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ListaAtalhos />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
