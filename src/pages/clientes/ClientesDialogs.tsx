import { AlertCircle, Printer } from "lucide-react";
import { useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClienteFormularioCampos } from "@/components/clientes/ClienteFormularioCampos";
import { nomeExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import type { ClienteFormData } from "@/lib/validations";
import { formatDatePtBr } from "@/lib/date-utils";
import type { Cliente, Equipamento } from "@/types";
import { ClientesStatusBadge } from "./ClientesStatusBadge";
import { ClienteContatosPanel } from "@/components/clientes/ClienteContatosPanel";

export function ClientesFormDialog({
  open,
  onOpenChange,
  editando,
  form,
  tipoPessoa,
  buscarCep,
  buscandoCep,
  salvando,
  erroDocumentoDuplicado,
  onDismissDuplicate,
  onBuscarClienteExistente,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  erroDocumentoDuplicado: string | null;
  onDismissDuplicate: () => void;
  onBuscarClienteExistente: () => void;
  editando: Cliente | null;
  form: UseFormReturn<ClienteFormData>;
  tipoPessoa: "PF" | "PJ" | null;
  buscarCep: (cep: string) => void | Promise<void>;
  buscandoCep: boolean;
  salvando: boolean;
  onSubmit: (data: ClienteFormData) => void | Promise<void>;
}) {
  const focusDocumentAfterAlert = useRef(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          <DialogDescription className="sr-only">
            Informe os dados do cliente e confirme o cadastro.
          </DialogDescription>
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
        <AlertDialog open={Boolean(erroDocumentoDuplicado)} onOpenChange={(open) => {
          if (!open) onDismissDuplicate();
        }}>
          <AlertDialogContent
            className="z-[60] sm:max-w-md"
            overlayClassName="bg-black/30"
            onCloseAutoFocus={(event) => {
              if (!focusDocumentAfterAlert.current) return;
              event.preventDefault();
              focusDocumentAfterAlert.current = false;
              document.getElementById("cliente-documento")?.focus();
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-red-900">
                <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
                CPF/CNPJ já cadastrado
              </AlertDialogTitle>
              <AlertDialogDescription>{erroDocumentoDuplicado}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { focusDocumentAfterAlert.current = true; }}>
                Corrigir documento
              </AlertDialogCancel>
              {erroDocumentoDuplicado?.includes("cliente ativo") && (
                <AlertDialogAction onClick={onBuscarClienteExistente}>
                  Buscar cliente existente
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
                    {formatDatePtBr(eq.data_entrada, "")}
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

export function ClientesContatosModal({
  open,
  onOpenChange,
  cliente,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: Cliente | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        {cliente && (
          <ClienteContatosPanel
            cliente={cliente}
            empresaId={typeof cliente.empresa_id === "number" ? cliente.empresa_id : undefined}
          />
        )}
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Fechar</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
