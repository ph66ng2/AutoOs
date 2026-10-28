import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EVENTO_ALERTAS_PORTAL } from "@/components/PortalAlertas";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateIsoInput } from "@/components/ui/date-iso-input";
import { Label } from "@/components/ui/label";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { db } from "@/lib/db";
import { prorrogarEEnviar } from "@/lib/envio-orcamento";
import { dataIsoEmDias, formatarDataIso } from "@/lib/orcamento-prazo";
import { SENSITIVE_PERMISSIONS, type EnvioManualOrcamento, type Equipamento } from "@/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipamentoId: number;
  /** Chamado depois de prorrogar e publicar, para recarregar o estado do portal. */
  onConcluido: () => void | Promise<void>;
  /** Chamado quando o envio automático precisa de ajuste manual do técnico. */
  onEnvioManual?: (envio: EnvioManualOrcamento) => void;
};

function texto(cause: unknown, fallback: string) {
  if (typeof cause === "string" && cause.trim()) return cause;
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** Prorroga o prazo de aprovação vencido e publica o orçamento no portal em seguida. */
export function ProrrogarPrazoDialog({ open, onOpenChange, equipamentoId, onConcluido, onEnvioManual }: Props) {
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const [data, setData] = useState(() => dataIsoEmDias(7));
  const [enviar, setEnviar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarResposta, setConfirmarResposta] = useState<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    if (open) {
      setData(dataIsoEmDias(7));
      setErro(null);
      setEnviar(true);
    }
  }, [open]);

  function perguntarRespostaPendente(): Promise<boolean> {
    return new Promise((resolve) => setConfirmarResposta(() => resolve));
  }

  function responder(ok: boolean) {
    confirmarResposta?.(ok);
    setConfirmarResposta(null);
  }

  async function confirmar() {
    if (!data || data < dataIsoEmDias(0)) {
      setErro("Escolha uma data a partir de hoje.");
      return;
    }
    const liberado = await ensureSensitiveAccess({
      title: "Prorrogar prazo e publicar",
      description: "Confirme o acesso para prorrogar o prazo de aprovação e publicar o orçamento no Portal do Cliente.",
      anyPermission: [SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES],
    });
    if (!liberado) return;

    setBusy(true);
    setErro(null);
    let prorrogou = false;
    try {
      const atual = await db.buscarEquipamento(equipamentoId);
      if (enviar) {
        const r = await prorrogarEEnviar(atual as Equipamento, data, perguntarRespostaPendente);
        if (r.respostaPendenteRecusada) return;
        if (!r.prorrogado) {
          setErro(r.avisos.join(" ") || "Não foi possível prorrogar o prazo.");
          return;
        }
        prorrogou = true;
        window.dispatchEvent(new CustomEvent(EVENTO_ALERTAS_PORTAL, { detail: { equipamentoIds: [equipamentoId] } }));
        const etapas = [
          `prazo prorrogado até ${formatarDataIso(data)}`,
          r.publicado ? "orçamento publicado no portal" : null,
          r.whatsapp?.enviado ? "WhatsApp enviado" : null,
          r.email?.enviado ? "e-mail enviado" : null,
        ].filter(Boolean).join(", ");
        toast.success(`${etapas.charAt(0).toUpperCase()}${etapas.slice(1)}.`);
        r.avisos.forEach((aviso) => toast.warning(aviso));
        if (r.envioManual) onEnvioManual?.(r.envioManual);
        onOpenChange(false);
        await onConcluido();
        return;
      }
      const base = { equipamentoId, novoPrazo: data, expectedUpdatedEm: atual.atualizado_em as string };
      let resultado = await db.prorrogarPrazoOrcamento(base);
      if (!resultado.prorrogado && resultado.respostaPendente) {
        const continuar = await perguntarRespostaPendente();
        if (!continuar) return;
        resultado = await db.prorrogarPrazoOrcamento({ ...base, confirmarRespostaPendente: true });
      }
      if (!resultado.prorrogado) {
        setErro("Não foi possível prorrogar o prazo.");
        return;
      }
      prorrogou = true;
      // A página escuta este evento para recarregar o equipamento aberto (prazo novo na tela).
      window.dispatchEvent(new CustomEvent(EVENTO_ALERTAS_PORTAL, { detail: { equipamentoIds: [equipamentoId] } }));
      // Idempotente: a prorrogação já pode ter republicado o orçamento.
      await db.publicarOrcamentoPortal(equipamentoId);
      toast.success(`Prazo prorrogado até ${formatarDataIso(data)} e orçamento publicado no portal.`);
      onOpenChange(false);
      await onConcluido();
    } catch (cause) {
      const msg = texto(cause, "A operação não foi concluída.");
      setErro(prorrogou ? `Prazo prorrogado, mas a publicação falhou: ${msg}` : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Prazo de aprovação vencido</DialogTitle>
            <DialogDescription>
              O prazo para o cliente aprovar este orçamento terminou. Escolha uma nova data para prorrogar e publicar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="novo-prazo-aprovacao">Novo prazo de aprovação</Label>
            <DateIsoInput
              id="novo-prazo-aprovacao"
              min={dataIsoEmDias(0)}
              value={data}
              onValueChange={setData}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={enviar}
                disabled={busy}
                onChange={(e) => setEnviar(e.target.checked)}
              />
              Enviar o orçamento ao cliente agora (WhatsApp e e-mail)
            </label>
            {erro ? <p role="alert" className="text-sm text-destructive">{erro}</p> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button disabled={busy || !data} onClick={() => void confirmar()}>
              {busy ? "Aguarde..." : enviar ? "Prorrogar e enviar" : "Prorrogar e publicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmarResposta !== null}
        onOpenChange={(next) => { if (!next) responder(false); }}
        title="Resposta do cliente pendente"
        description="O cliente já respondeu. Prorrogar anula a resposta pendente. Continuar?"
        confirmLabel="Continuar"
        cancelLabel="Cancelar"
        onConfirm={() => responder(true)}
        onCancel={() => responder(false)}
      />
    </>
  );
}
