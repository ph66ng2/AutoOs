import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AnaliseAjusteOrcamento, ModoAjusteAprovado, OpcoesAjusteOrcamento } from "@/types";

type Props = {
  open: boolean;
  /** `aprovado`: orçamento já aprovado foi alterado. `pendente`: cliente já respondeu a versão publicada. */
  variante: "aprovado" | "pendente";
  analise: AnaliseAjusteOrcamento | null;
  salvando?: boolean;
  onConfirmar: (opcoes: OpcoesAjusteOrcamento) => void;
  onCancelar: () => void;
};

/**
 * Pergunta ao operador, na hora de salvar, o que fazer com uma alteração que o cliente ainda
 * não viu: ajustar sem nova aprovação ou pedir nova aprovação (orçamento aprovado), ou confirmar
 * que a nova versão anula uma resposta que o cliente já deu (orçamento aguardando aprovação).
 */
export function EscolhaAjusteOrcamentoDialog({ open, variante, analise, salvando = false, onConfirmar, onCancelar }: Props) {
  const [modo, setModo] = useState<ModoAjusteAprovado>("SEM_NOVA_APROVACAO");
  const [devolver, setDevolver] = useState(false);

  useEffect(() => {
    if (open) {
      setModo("SEM_NOVA_APROVACAO");
      setDevolver(false);
    }
  }, [open]);

  if (!analise) return null;

  if (variante === "pendente") {
    const aprovou = analise.respostaPendente?.decisao === "APROVAR";
    return (
      <Dialog open={open} onOpenChange={(aberto) => { if (!aberto) onCancelar(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>O cliente já respondeu este orçamento</DialogTitle>
            <DialogDescription>
              {analise.respostaPendente?.contato ? `${analise.respostaPendente.contato} ` : "O cliente "}
              {aprovou ? "aprovou" : "recusou"} pelo portal e a equipe ainda não aplicou a resposta.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Se você salvar esta alteração, uma <strong>nova versão</strong> será publicada no portal e a resposta anterior deixa de valer. O cliente precisará responder de novo.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={onCancelar} disabled={salvando}>Voltar</Button>
            <Button onClick={() => onConfirmar({ confirmarRespostaPendente: true })} disabled={salvando}>
              Publicar nova versão e anular a resposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const podePedir = analise.podePedirNovaAprovacao;
  const exigeEstoque = modo === "NOVA_APROVACAO" && analise.exigeDecisaoEstoque;
  const podeConfirmar = !salvando && (modo === "SEM_NOVA_APROVACAO" || (podePedir && (!exigeEstoque || devolver)));

  return (
    <Dialog open={open} onOpenChange={(aberto) => { if (!aberto) onCancelar(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Este orçamento já foi aprovado</DialogTitle>
          <DialogDescription>Como o cliente deve ficar sabendo desta alteração?</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2 text-sm">
          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
            <input
              type="radio"
              name="modo-ajuste-aprovado"
              className="mt-1"
              checked={modo === "SEM_NOVA_APROVACAO"}
              onChange={() => setModo("SEM_NOVA_APROVACAO")}
            />
            <span>
              <span className="block font-medium">Ajuste sem nova aprovação</span>
              <span className="block text-muted-foreground">
                O cliente já concordou com a mudança. O orçamento continua aprovado e o portal passa a mostrar o valor novo.
              </span>
            </span>
          </label>
          <label className={`flex items-start gap-2 rounded-md border p-3 ${podePedir ? "cursor-pointer" : "opacity-60"}`}>
            <input
              type="radio"
              name="modo-ajuste-aprovado"
              className="mt-1"
              checked={modo === "NOVA_APROVACAO"}
              disabled={!podePedir}
              onChange={() => setModo("NOVA_APROVACAO")}
            />
            <span>
              <span className="block font-medium">Pedir nova aprovação ao cliente</span>
              <span className="block text-muted-foreground">
                {podePedir
                  ? "O orçamento volta para aguardando aprovação e a nova versão é publicada no portal para o cliente responder."
                  : "Só dá para pedir nova aprovação enquanto o orçamento está Aprovado, antes de o serviço começar."}
              </span>
            </span>
          </label>

          {exigeEstoque && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <p className="font-medium">{analise.totalBaixado} peça(s) já foram baixadas do estoque:</p>
              <ul className="list-disc pl-5">
                {analise.pecasBaixadas.map((peca) => (
                  <li key={peca.produtoId}>{peca.quantidade} × {peca.nome}</li>
                ))}
              </ul>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={devolver} onChange={(event) => setDevolver(event.target.checked)} />
                <span>Confirmo que estas peças estão intactas e voltam ao estoque. A nova aprovação baixa de novo.</span>
              </label>
            </div>
          )}
        </fieldset>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>Voltar</Button>
          <Button
            onClick={() => onConfirmar({ modoAprovado: modo, devolverEstoque: modo === "NOVA_APROVACAO" ? devolver : false })}
            disabled={!podeConfirmar}
          >
            Salvar alteração
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
