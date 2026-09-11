import { useState } from "react";
import { AlertTriangle, DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { RegularizacaoLegadoPrevia } from "@/types";

const conflitoLabel: Record<string, string> = {
  EQUIPAMENTO_OUTRA_EMPRESA: "Equipamento vinculado a outra empresa",
  VERIFICACAO_EMPRESA_DIVERGENTE: "Verificação com empresa divergente",
  IMAGEM_EMPRESA_DIVERGENTE: "Imagem com empresa divergente",
  COMUNICACAO_EMPRESA_DIVERGENTE: "Comunicação com empresa divergente",
  CONTATO_EMPRESA_DIVERGENTE: "Contato com empresa divergente",
};

export function RegularizacaoLegadosDialog({ open, previa, loading, onOpenChange, onConfirm }: {
  open: boolean;
  previa: RegularizacaoLegadoPrevia | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (pin: string) => void | Promise<void>;
}) {
  const [pin, setPin] = useState("");
  if (!previa) return null;
  const total = previa.clientes + previa.equipamentos + previa.verificacoes + previa.imagens + previa.comunicacoes;
  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) setPin(""); onOpenChange(value); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><DatabaseZap className="h-5 w-5" />Regularizar cadastros antigos</DialogTitle>
          <DialogDescription>Os registros elegíveis serão vinculados à empresa <strong>{previa.empresa_nome}</strong>. Contatos continuam opcionais.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {[['Clientes', previa.clientes], ['Equipamentos', previa.equipamentos], ['Verificações', previa.verificacoes], ['Imagens', previa.imagens], ['Comunicações', previa.comunicacoes]].map(([label, value]) => (
            <div key={String(label)} className="rounded-md border p-3"><p className="text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>
          ))}
        </div>
        {(previa.conflitos.length > 0 || previa.equipamentos_sem_cliente.length > 0 || previa.contatos_irregulares > 0) && (
          <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" />Itens que não serão alterados automaticamente</p>
            <p>{previa.conflitos.length} conflito(s), {previa.equipamentos_sem_cliente.length} equipamento(s) sem cliente e {previa.contatos_irregulares} contato(s) irregular(es).</p>
            {previa.conflitos.length > 0 && (
              <ul className="max-h-32 list-disc space-y-1 overflow-y-auto pl-5" aria-label="Conflitos encontrados">
                {previa.conflitos.map((conflito, index) => (
                  <li key={`${conflito.tipo}-${conflito.cliente_id ?? "sem-cliente"}-${conflito.equipamento_id ?? "sem-equipamento"}-${index}`}>
                    {conflitoLabel[conflito.tipo] ?? conflito.tipo}
                    {conflito.cliente_id ? ` — cliente #${conflito.cliente_id}` : ""}
                    {conflito.equipamento_id ? `, equipamento #${conflito.equipamento_id}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {previa.equipamentos_sem_cliente.length > 0 && (
              <p>Equipamentos sem cliente: {previa.equipamentos_sem_cliente.map((id) => `#${id}`).join(", ")}.</p>
            )}
            {previa.contatos_irregulares > 0 && (
              <p>Nenhum contato será criado, movido ou sobrescrito. Contatos de outra empresa bloqueiam a cadeia correspondente.</p>
            )}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="pin-regularizacao">PIN do administrador *</Label>
          <Input id="pin-regularizacao" type="password" inputMode="numeric" autoComplete="off" value={pin} onChange={(event) => setPin(event.target.value)} />
          <p className="text-xs text-muted-foreground">A prévia expira em {new Date(previa.expira_em).toLocaleTimeString("pt-BR")}. Se os dados mudarem, uma nova confirmação será exigida.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button onClick={() => void onConfirm(pin)} disabled={loading || pin.trim().length < 4 || total === 0}>{loading ? "Regularizando..." : `Regularizar ${total} registro(s)`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
