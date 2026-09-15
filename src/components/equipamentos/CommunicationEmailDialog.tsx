import { useEffect, useRef, useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { emailValido } from "@/pages/equipamentos/equipamentos-page-utils";
import { recipientOriginLabel, type ResolvedRecipient } from "@/lib/recipient-resolver";

interface CommunicationEmailDialogProps {
  open: boolean;
  recipient: ResolvedRecipient | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (email: string, salvar: boolean) => void | Promise<boolean | void>;
  onSkip: () => void | Promise<void>;
}

export function CommunicationEmailDialog({
  open,
  recipient,
  onOpenChange,
  onConfirm,
  onSkip,
}: CommunicationEmailDialogProps) {
  const [email, setEmail] = useState("");
  const [salvar, setSalvar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fechamentoPorAcao = useRef<"confirmar" | "cancelar" | null>(null);
  const temEndereco = Boolean(recipient?.endereco);

  useEffect(() => {
    if (!open) return;
    setEmail(recipient?.endereco || "");
    setSalvar(false);
    setErro(null);
    fechamentoPorAcao.current = null;
  }, [open, recipient]);

  async function confirmar() {
    const endereco = email.trim();
    if (!endereco || !emailValido(endereco)) {
      setErro("Informe um e-mail válido.");
      return;
    }
    setErro(null);
    fechamentoPorAcao.current = "confirmar";
    const resultado = await onConfirm(endereco, salvar);
    if (resultado !== false) onOpenChange(false);
    else fechamentoPorAcao.current = null;
  }

  async function cancelar() {
    setErro(null);
    fechamentoPorAcao.current = "cancelar";
    await onSkip();
    onOpenChange(false);
  }

  function tratarFechamento(openValue: boolean) {
    if (!openValue && !fechamentoPorAcao.current) {
      fechamentoPorAcao.current = "cancelar";
      void onSkip();
    }
    if (openValue) fechamentoPorAcao.current = null;
    onOpenChange(openValue);
  }

  return (
    <Dialog open={open} onOpenChange={tratarFechamento}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" /> Envio por e-mail
          </DialogTitle>
          <DialogDescription>
            Revise o destinatário e escolha se a comunicação deve ser enviada agora.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p>Quer enviar a comunicação automaticamente por e-mail?</p>
          <div className="rounded-md border bg-muted/30 p-3 space-y-1">
            <p><span className="text-muted-foreground">Nome do destinatário:</span> <strong>{recipient?.nome || "Cliente"}</strong></p>
            <p><span className="text-muted-foreground">Endereço:</span> {recipient?.endereco || "Não informado"}</p>
            <p><span className="text-muted-foreground">Origem:</span> {recipientOriginLabel(recipient?.origem || "sem_envio")}</p>
          </div>
          {!temEndereco && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="email-destinatario-manual">E-mail para este envio</Label>
                <Input
                  id="email-destinatario-manual"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setErro(null);
                  }}
                  placeholder="email@exemplo.com"
                  autoFocus
                />
                {erro && <p className="text-xs text-red-600" role="alert">{erro}</p>}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={salvar} onCheckedChange={setSalvar} />
                <span>Salvar este e-mail para próximos envios</span>
              </label>
            </div>
          )}
          {temEndereco && erro && <p className="text-xs text-red-600" role="alert">{erro}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void cancelar()}>Cancelar envio</Button>
          <Button type="button" onClick={() => void confirmar()}>Enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
