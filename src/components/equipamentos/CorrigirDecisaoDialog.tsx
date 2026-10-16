import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import type { AnaliseCorrecaoDecisao, Equipamento } from "@/types";

type Props = {
  equipamento: Equipamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que o orçamento foi reaberto, para a página recarregar a lista. */
  onCorrigido: () => void | Promise<void>;
};

const MOTIVO_MINIMO = 5;

const moeda = (valor?: number | null) =>
  valor == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

function mensagemErro(cause: unknown, fallback: string) {
  return typeof cause === "string" && cause.trim() ? cause : fallback;
}

/**
 * Corrige uma decisão já aplicada. Mostra pagamento, valores e peças baixadas antes de reabrir
 * o orçamento e só devolve peças ao estoque com a confirmação explícita do operador.
 */
export function CorrigirDecisaoDialog({ equipamento, open, onOpenChange, onCorrigido }: Props) {
  const [analise, setAnalise] = useState<AnaliseCorrecaoDecisao | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [devolver, setDevolver] = useState(false);
  const equipamentoId = equipamento?.id;

  useEffect(() => {
    if (!open || !equipamentoId) return;
    let cancelado = false;
    setAnalise(null);
    setError(null);
    setMotivo("");
    setDevolver(false);
    setLoading(true);
    db.analisarCorrecaoDecisao(equipamentoId)
      .then((result) => { if (!cancelado) setAnalise(result); })
      .catch((cause) => { if (!cancelado) setError(mensagemErro(cause, "Não foi possível analisar a decisão.")); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [open, equipamentoId]);

  const motivoOk = motivo.trim().length >= MOTIVO_MINIMO;
  const estoqueOk = !analise?.exigeDecisaoEstoque || devolver;
  const podeConfirmar = Boolean(analise?.podeCorrigir) && motivoOk && estoqueOk && !busy;

  async function confirmar() {
    if (!equipamento?.id || !equipamento.atualizado_em || !podeConfirmar) return;
    setBusy(true);
    setError(null);
    try {
      await db.corrigirDecisaoOrcamento({
        equipamento_id: equipamento.id,
        expected_updated_em: equipamento.atualizado_em,
        motivo: motivo.trim(),
        devolver_estoque: devolver,
      });
      onOpenChange(false);
      await onCorrigido();
    } catch (cause) {
      setError(mensagemErro(cause, "A correção não foi concluída."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Corrigir decisão do orçamento</DialogTitle>
          <DialogDescription>
            Reabre o orçamento para uma nova decisão. Pagamento, serviços aprovados e baixas de estoque são conferidos juntos.
          </DialogDescription>
        </DialogHeader>

        {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        {analise && (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border bg-muted/40 p-3">
              <p><strong>Etapa atual:</strong> {analise.status}</p>
              <p><strong>Pagamento registrado:</strong> {analise.pagamentoCodigo ?? "nenhum"}{analise.pagamentoDetalhe ? ` (${analise.pagamentoDetalhe})` : ""}</p>
              <p><strong>Valor atual:</strong> {moeda(analise.valorAtual)} · <strong>valor enviado ao cliente:</strong> {moeda(analise.valorOriginal)}</p>
            </div>

            {analise.bloqueios.length > 0 && (
              <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
                <p className="font-semibold">Não dá para corrigir automaticamente</p>
                <ul className="mt-1 list-disc pl-5">
                  {analise.bloqueios.map((bloqueio) => <li key={bloqueio}>{bloqueio}</li>)}
                </ul>
              </div>
            )}

            {analise.podeCorrigir && (
              <>
                <p>
                  Ao confirmar: o orçamento volta a <strong>Aguardando aprovação</strong> com a versão enviada ao cliente, e a forma de pagamento e as decisões por serviço são apagadas.
                </p>

                {analise.exigeDecisaoEstoque ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <p className="font-medium">{analise.totalBaixado} peça(s) já foram baixadas do estoque:</p>
                    <ul className="list-disc pl-5">
                      {analise.pecasBaixadas.map((peca) => (
                        <li key={peca.produtoId}>{peca.quantidade} × {peca.nome}</li>
                      ))}
                    </ul>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="checkbox" checked={devolver} onChange={(event) => setDevolver(event.target.checked)} />
                      <span>Confirmo que estas peças estão intactas e voltam ao estoque (gera entrada de estoque).</span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Se alguma peça foi usada, não confirme: o caso precisa de atendimento humano.
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Nenhuma peça foi baixada do estoque por esta aprovação.</p>
                )}

                <div className="space-y-1">
                  <label htmlFor="motivo-correcao-decisao" className="font-medium">Motivo da correção *</label>
                  <Textarea
                    id="motivo-correcao-decisao"
                    value={motivo}
                    onChange={(event) => setMotivo(event.target.value)}
                    placeholder="Ex.: cliente pediu para refazer a aprovação"
                  />
                  <p className="text-xs text-muted-foreground">Fica registrado na auditoria.</p>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Fechar</Button>
          {analise?.podeCorrigir && (
            <Button type="button" disabled={!podeConfirmar} onClick={() => void confirmar()}>
              {busy ? "Corrigindo..." : "Reabrir orçamento"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
