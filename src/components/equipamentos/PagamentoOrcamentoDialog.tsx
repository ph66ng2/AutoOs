import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormaPagamentoFields } from "@/components/equipamentos/FormaPagamentoFields";
import type { FormaPagamento, FormaPagamentoCodigo } from "@/types";

interface PagamentoOrcamentoDialogProps {
  open: boolean;
  loading?: boolean;
  error?: string | null;
  initialCodigo?: FormaPagamentoCodigo | null;
  initialDetalhe?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (pagamento: FormaPagamento) => void | Promise<boolean | void>;
}

export function PagamentoOrcamentoDialog({
  open,
  loading = false,
  error,
  initialCodigo,
  initialDetalhe,
  onOpenChange,
  onConfirm,
}: PagamentoOrcamentoDialogProps) {
  const [codigo, setCodigo] = useState<FormaPagamentoCodigo | "">(initialCodigo || "");
  const [detalhe, setDetalhe] = useState(initialDetalhe || "");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCodigo(initialCodigo || "");
    setDetalhe(initialDetalhe || "");
    setValidationError(null);
  }, [open, initialCodigo, initialDetalhe]);

  async function confirmar() {
    if (!codigo) {
      setValidationError("Escolha uma forma de pagamento para aprovar o orçamento.");
      return;
    }
    if (codigo === "OUTRO" && !detalhe.trim()) {
      setValidationError("Descreva a forma de pagamento escolhida em Outro.");
      return;
    }
    setValidationError(null);
    const resultado = await onConfirm({ codigo, detalhe: codigo === "OUTRO" ? detalhe.trim() : null });
    if (resultado !== false) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent tamanho="m">
        <DialogHeader>
          <DialogTitle>Forma de pagamento da aprovação</DialogTitle>
          <DialogDescription className="sr-only">Escolha como o cliente vai pagar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <FormaPagamentoFields
            codigo={codigo}
            detalhe={detalhe}
            onCodigoChange={(value) => { setCodigo(value); setValidationError(null); }}
            onDetalheChange={(value) => { setDetalhe(value); setValidationError(null); }}
            required
            disabled={loading}
          />
          {(validationError || error) && <p className="whitespace-pre-line text-sm text-destructive" role="alert">{validationError || error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button type="button" onClick={() => void confirmar()} disabled={loading}>{loading ? "Aprovando..." : "Confirmar aprovação"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
