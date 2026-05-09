import { Printer } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { ClienteFormularioCampos } from "@/components/clientes/ClienteFormularioCampos";
import { nomeExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import type { ClienteFormData } from "@/lib/validations";
import type { Cliente, Equipamento } from "@/types";
import { ClientesStatusBadge } from "./ClientesStatusBadge";

export function ClientesFormDialog({
  open,
  onOpenChange,
  editando,
  form,
  tipoPessoa,
  buscarCep,
  buscandoCep,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editando: Cliente | null;
  form: UseFormReturn<ClienteFormData>;
  tipoPessoa: "PF" | "PJ" | null;
  buscarCep: (cep: string) => void | Promise<void>;
  buscandoCep: boolean;
  salvando: boolean;
  onSubmit: (data: ClienteFormData) => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <ClienteFormularioCampos
            form={form}
            tipoPessoa={tipoPessoa}
            buscarCep={buscarCep}
            buscandoCep={buscandoCep}
          />

          <DialogFooter>
            <DialogClose asChild><Button variant="outline" type="button">Cancelar</Button></DialogClose>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClientesDeleteDialog({
  open,
  onOpenChange,
  deletando,
  salvando,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deletando: Cliente | null;
  salvando: boolean;
  onDelete: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
        <p className="text-muted-foreground">Excluir cliente <strong>{deletando ? nomeExibicaoCliente(deletando) : ""}</strong>?</p>
        <p className="text-sm text-red-500">Esta ação não pode ser desfeita.</p>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
          <Button variant="destructive" onClick={onDelete} disabled={salvando}>{salvando ? "Excluindo..." : "Excluir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClientesEquipamentosModal({
  open,
  onOpenChange,
  cliente,
  equipamentos,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: Cliente | null;
  equipamentos: Equipamento[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Todos os equipamentos - {cliente ? nomeExibicaoCliente(cliente) : "Cliente"}
          </DialogTitle>
        </DialogHeader>
        {equipamentos.length === 0 ? (
          <div className="text-sm text-muted-foreground">Nenhum equipamento vinculado.</div>
        ) : (
          <div className="space-y-2">
            {equipamentos.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between rounded border p-2">
                <div className="flex items-center gap-3">
                  <Printer className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{eq.marca} {eq.modelo}</p>
                    <p className="text-xs text-muted-foreground font-mono">{eq.serial_number}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <ClientesStatusBadge status={eq.status} />
                  <span className="text-xs text-muted-foreground">
                    {eq.data_entrada ? new Date(eq.data_entrada).toLocaleDateString("pt-BR") : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
