import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Desfaz a reprovação registrada por engano (abre "Corrigir decisão do orçamento"). */
  onCorrigirEngano: () => void;
  /** Volta para Aguardando aprovação para enviar um orçamento novo. */
  onNovaProposta: () => void;
};

/**
 * Escolhe como reabrir um orçamento reprovado: corrigir a decisão registrada por engano ou
 * fazer uma nova proposta. Só fecha o diálogo e repassa a escolha para a página.
 */
export function ReabrirOrcamentoDialog({ open, onOpenChange, onCorrigirEngano, onNovaProposta }: Props) {
  function escolher(acao: () => void) {
    onOpenChange(false);
    acao();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reabrir orçamento</DialogTitle>
          <DialogDescription>Escolha o que aconteceu com a reprovação.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full flex-col items-start gap-1 whitespace-normal py-3 text-left"
            onClick={() => escolher(onCorrigirEngano)}
          >
            <span className="font-medium">Foi um engano (corrigir a decisão)</span>
            <span className="text-xs font-normal text-muted-foreground">
              Desfaz a reprovação registrada por engano; pagamento, serviços e estoque são conferidos.
            </span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full flex-col items-start gap-1 whitespace-normal py-3 text-left"
            onClick={() => escolher(onNovaProposta)}
          >
            <span className="font-medium">Nova proposta</span>
            <span className="text-xs font-normal text-muted-foreground">
              Volta para Aguardando aprovação para enviar o orçamento de novo.
            </span>
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
