import { useEffect, useState } from "react";
import { Building2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { VinculoEmpresaPerfilInput, VinculoEmpresaPerfilPrevia } from "@/types";

const NOVA_EMPRESA = "nova";

export function VinculoEmpresaPerfilDialog({ open, previa, loading, onOpenChange, onConfirm }: {
  open: boolean;
  previa: VinculoEmpresaPerfilPrevia | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (input: VinculoEmpresaPerfilInput, pin: string) => void | Promise<void>;
}) {
  const [selecao, setSelecao] = useState(NOVA_EMPRESA);
  const [nome, setNome] = useState("AutoOS");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (!open || !previa) return;
    setSelecao(previa.empresas_ativas.length === 1 ? String(previa.empresas_ativas[0].id) : NOVA_EMPRESA);
    setNome("AutoOS");
    setEmail("");
    setCnpj("");
    setPin("");
  }, [open, previa]);

  if (!previa) return null;
  const criando = selecao === NOVA_EMPRESA;
  const podeConfirmar = pin.trim().length >= 4
    && (criando ? nome.trim().length >= 2 && email.includes("@") : Boolean(selecao));

  function confirmar() {
    const input: VinculoEmpresaPerfilInput = criando
      ? {
          nova_empresa_nome: nome.trim(),
          nova_empresa_email: email.trim(),
          nova_empresa_cnpj: cnpj.trim() || undefined,
        }
      : { empresa_id: Number(selecao) };
    void onConfirm(input, pin);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Vincular perfil à empresa interna</DialogTitle>
          <DialogDescription>
            O perfil legado <strong>{previa.perfil_nome}</strong> precisa pertencer à AutoOS antes de regularizar clientes antigos.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4" />Vínculo administrativo permanente</p>
          <p>Esta operação não cria contatos nem altera clientes. Um perfil já vinculado nunca será movido para outra empresa.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="empresa-vinculo">Empresa interna *</Label>
          <select
            id="empresa-vinculo"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selecao}
            onChange={(event) => setSelecao(event.target.value)}
            disabled={loading}
          >
            {previa.empresas_ativas.map((empresa) => (
              <option key={empresa.id} value={empresa.id}>{empresa.nome} — {empresa.email}</option>
            ))}
            <option value={NOVA_EMPRESA}>Cadastrar nova empresa interna</option>
          </select>
        </div>

        {criando && (
          <div className="grid gap-3">
            <div className="space-y-2">
              <Label htmlFor="nova-empresa-nome">Nome *</Label>
              <Input id="nova-empresa-nome" value={nome} onChange={(event) => setNome(event.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nova-empresa-email">Email administrativo *</Label>
              <Input id="nova-empresa-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nova-empresa-cnpj">CNPJ da AutoOS (opcional)</Label>
              <Input id="nova-empresa-cnpj" value={cnpj} onChange={(event) => setCnpj(event.target.value)} disabled={loading} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="pin-vinculo-empresa">PIN do administrador *</Label>
          <Input id="pin-vinculo-empresa" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value)} disabled={loading} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={confirmar} disabled={loading || !podeConfirmar}>{loading ? "Vinculando..." : "Vincular e continuar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
