import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import type { AnaliseCorrecaoDecisao, Equipamento, ModoCorrecaoDecisao, PortalAjusteInfo } from "@/types";

export type CorrigirDecisaoDeps = {
  analisar: (equipamentoId: Equipamento["id"]) => Promise<AnaliseCorrecaoDecisao>;
  corrigir: (input: {
    equipamento_id: Equipamento["id"];
    expected_updated_em: string;
    motivo: string;
    devolver_estoque: boolean;
    modo: ModoCorrecaoDecisao;
  }) => Promise<{ portal?: PortalAjusteInfo } | void>;
};

type Props = {
  equipamento: Equipamento | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado depois que o orçamento foi reaberto, para a página recarregar a lista. */
  /** Recebe o que aconteceu no portal (republicação automática ou aviso de falha). */
  onCorrigido: (portal?: PortalAjusteInfo) => void | Promise<void>;
  deps?: CorrigirDecisaoDeps;
};

const MOTIVO_MINIMO = 5;

const moeda = (valor?: number | null) =>
  valor == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

function mensagemErro(cause: unknown, fallback: string) {
  if (typeof cause === "string" && cause.trim()) return cause;
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return fallback;
}

/** Com os dois modos disponíveis, começa pelo que não perde o ajuste feito no orçamento. */
function modoInicial(analise: AnaliseCorrecaoDecisao): ModoCorrecaoDecisao {
  if (analise.permiteManter && (analise.ajustadoAposDecisao || !analise.permiteRestaurar)) return "MANTER_ATUAL";
  return "RESTAURAR_ORIGINAL";
}

/**
 * Corrige uma decisão já aplicada. Mostra pagamento, valores e peças baixadas antes de reabrir
 * o orçamento e só devolve peças ao estoque com a confirmação explícita do operador. Quando o
 * orçamento foi ajustado depois da decisão, o operador escolhe entre manter o ajuste ou restaurar
 * a versão enviada ao cliente.
 */
export function CorrigirDecisaoDialog({ equipamento, open, onOpenChange, onCorrigido, deps }: Props) {
  const [analise, setAnalise] = useState<AnaliseCorrecaoDecisao | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [devolver, setDevolver] = useState(false);
  const [modo, setModo] = useState<ModoCorrecaoDecisao>("RESTAURAR_ORIGINAL");
  const equipamentoId = equipamento?.id;
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    if (!open || !equipamentoId) return;
    let cancelado = false;
    setAnalise(null);
    setError(null);
    setMotivo("");
    setDevolver(false);
    setLoading(true);
    (depsRef.current?.analisar ?? ((id) => db.analisarCorrecaoDecisao(Number(id))))(equipamentoId)
      .then((result) => {
        if (cancelado) return;
        setAnalise(result);
        setModo(modoInicial(result));
      })
      .catch((cause) => { if (!cancelado) setError(mensagemErro(cause, "Não foi possível analisar a decisão.")); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, [open, equipamentoId]);

  const motivoOk = motivo.trim().length >= MOTIVO_MINIMO;
  const estoqueOk = !analise?.exigeDecisaoEstoque || devolver;
  const modoValido = modo === "MANTER_ATUAL" ? Boolean(analise?.permiteManter) : Boolean(analise?.permiteRestaurar);
  const podeConfirmar = Boolean(analise?.podeCorrigir) && modoValido && motivoOk && estoqueOk && !busy;
  const escolheModo = Boolean(analise?.permiteManter && analise?.permiteRestaurar);
  const decisao = analise?.status === "REPROVADO" ? "recusa" : "aprovação";

  async function confirmar() {
    if (!equipamento?.id || !equipamento.atualizado_em || !podeConfirmar) return;
    setBusy(true);
    setError(null);
    try {
      const corrigir = depsRef.current?.corrigir ?? ((input) => db.corrigirDecisaoOrcamento({
        ...input,
        equipamento_id: Number(input.equipamento_id),
      }));
      const resultado = await corrigir({
        equipamento_id: equipamento.id,
        expected_updated_em: equipamento.atualizado_em,
        motivo: motivo.trim(),
        devolver_estoque: devolver,
        modo,
      });
      onOpenChange(false);
      await onCorrigido(resultado?.portal);
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
            Desfaz a decisão e volta o orçamento para aguardando aprovação. Pagamento, decisões por serviço e baixas de estoque são desfeitos juntos.
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
                <p className="font-semibold">Não dá para corrigir a decisão agora</p>
                <ul className="mt-1 list-disc pl-5">
                  {analise.bloqueios.map((bloqueio) => <li key={bloqueio}>{bloqueio}</li>)}
                </ul>
              </div>
            )}

            {analise.podeCorrigir && (
              <>
                {escolheModo ? (
                  <fieldset className="space-y-2">
                    <legend className="font-medium">
                      O orçamento foi alterado depois da {decisao}. O que fazer com essa alteração?
                    </legend>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                      <input
                        type="radio"
                        name="modo-correcao-decisao"
                        className="mt-1"
                        checked={modo === "MANTER_ATUAL"}
                        onChange={() => setModo("MANTER_ATUAL")}
                      />
                      <span>
                        <span className="block font-medium">Voltar para aguardando aprovação mantendo o orçamento atual</span>
                        <span className="block text-muted-foreground">
                          Serviços, peças e valor ({moeda(analise.valorAtual)}) ficam como estão. Só a decisão, o pagamento e as baixas de estoque são desfeitos.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                      <input
                        type="radio"
                        name="modo-correcao-decisao"
                        className="mt-1"
                        checked={modo === "RESTAURAR_ORIGINAL"}
                        onChange={() => setModo("RESTAURAR_ORIGINAL")}
                      />
                      <span>
                        <span className="block font-medium">Restaurar o orçamento enviado ao cliente</span>
                        <span className="block text-muted-foreground">
                          Volta para a versão enviada ({moeda(analise.valorOriginal)}).
                        </span>
                      </span>
                    </label>
                    {modo === "RESTAURAR_ORIGINAL" && (
                      <p role="note" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-950">
                        Atenção: a alteração feita depois da {decisao} será perdida.
                      </p>
                    )}
                  </fieldset>
                ) : modo === "MANTER_ATUAL" ? (
                  <p>
                    Este orçamento não guardou a versão enviada ao cliente, então não dá para restaurá-la. Ao confirmar, ele volta a <strong>Aguardando aprovação</strong> com os serviços, peças e valor atuais, e o pagamento e as decisões por serviço são apagados.
                  </p>
                ) : (
                  <p>
                    Ao confirmar: o orçamento volta a <strong>Aguardando aprovação</strong> com a versão enviada ao cliente, e a forma de pagamento e as decisões por serviço são apagadas.
                  </p>
                )}

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
                      Se alguma peça já foi usada, não confirme e não corrija por aqui: confira o estoque antes.
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
