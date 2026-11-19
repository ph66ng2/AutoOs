import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ATALHOS: { teclas: string[]; acao: string }[] = [
  { teclas: ["Ctrl", "K"], acao: "Buscar equipamento, cliente, insumo ou tela" },
  { teclas: ["N"], acao: "Nova entrada de equipamento" },
  { teclas: ["/"], acao: "Ir para a busca da tela" },
  { teclas: ["Ctrl", "clique"], acao: "Combinar status no filtro de equipamentos" },
  { teclas: ["Esc"], acao: "Fechar a janela aberta" },
  { teclas: ["?"], acao: "Mostrar esta lista" },
];

export function AjudaAtalhos({ aberta, onAbertaChange }: { aberta: boolean; onAbertaChange: (aberta: boolean) => void }) {
  return (
    <Dialog open={aberta} onOpenChange={onAbertaChange}>
      <DialogContent tamanho="p">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>As letras não valem enquanto você digita num campo.</DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
