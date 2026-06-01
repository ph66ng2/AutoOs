import {
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormValidationError } from "@/components/ui/form-validation-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  MovimentacaoFormData,
  ProdutoFormData,
} from "@/lib/validations";
import type { Produto } from "@/types";
import { CATEGORIA_OPTIONS } from "./insumos-page-constants";

export function InsumosProdutoDialog({
  open,
  onOpenChange,
  editando,
  form,
  salvando,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editando: Produto | null;
  form: UseFormReturn<ProdutoFormData>;
  salvando: boolean;
  onSubmit: (data: ProdutoFormData) => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar Insumo" : "Novo Insumo"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input {...form.register("nome")} placeholder="Toner HP 26A" />
              <FormValidationError message={form.formState.errors.nome?.message} />
            </div>
            <div className="space-y-2">
              <Label>Código</Label>
              <Input {...form.register("codigo")} placeholder="SKU-001" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Controller
                control={form.control}
                name="categoria"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIA_OPTIONS.filter((c) => c.value !== "TODOS").map(
                        (c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                )}
              />
              <FormValidationError message={form.formState.errors.categoria?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              {...form.register("descricao")}
              placeholder="Descrição do produto..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Qtd. Estoque *</Label>
              <Input
                type="number"
                {...form.register("quantidade_estoque", { valueAsNumber: true })}
                min={0}
              />
              <FormValidationError message={form.formState.errors.quantidade_estoque?.message} />
            </div>
            <div className="space-y-2">
              <Label>Qtd. Mínima *</Label>
              <Input
                type="number"
                {...form.register("quantidade_minima", { valueAsNumber: true })}
                min={0}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Preço Custo</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("preco_custo", { valueAsNumber: true })}
                min={0}
              />
            </div>
            <div className="space-y-2">
              <Label>Preço Venda</Label>
              <Input
                type="number"
                step="0.01"
                {...form.register("preco_venda", { valueAsNumber: true })}
                min={0}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Localização</Label>
            <Input
              {...form.register("localizacao")}
              placeholder="Prateleira A, Gaveta 3..."
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InsumosMovimentacaoDialog({
  open,
  onOpenChange,
  movimentando,
  movForm,
  salvando,
  onMovSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movimentando: Produto | null;
  movForm: UseFormReturn<MovimentacaoFormData>;
  salvando: boolean;
  onMovSubmit: (data: MovimentacaoFormData) => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Movimentação de Estoque</DialogTitle>
        </DialogHeader>
        {movimentando && (
          <div className="bg-accent/50 p-3 rounded-lg mb-2">
            <p className="font-medium">{movimentando.nome}</p>
            <p className="text-sm text-muted-foreground">
              Estoque atual:{" "}
              <span className="font-bold">{movimentando.quantidade_estoque}</span>{" "}
              un.
            </p>
          </div>
        )}
        <form onSubmit={movForm.handleSubmit(onMovSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Controller
                control={movForm.control}
                name="tipo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENTRADA">
                        <div className="flex items-center gap-2">
                          <ArrowUpCircle className="h-4 w-4 text-green-600" />
                          Entrada
                        </div>
                      </SelectItem>
                      <SelectItem value="SAIDA">
                        <div className="flex items-center gap-2">
                          <ArrowDownCircle className="h-4 w-4 text-red-500" />
                          Saída
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input
                type="number"
                {...movForm.register("quantidade", { valueAsNumber: true })}
                min={1}
              />
              <FormValidationError message={movForm.formState.errors.quantidade?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Origem / Motivo *</Label>
            <Input
              {...movForm.register("origem")}
              placeholder="Compra, uso em manutenção..."
            />
            <FormValidationError message={movForm.formState.errors.origem?.message} />
          </div>

          <div className="space-y-2">
            <Label>Referência (NF, OS...)</Label>
            <Input
              {...movForm.register("referencia")}
              placeholder="NF-12345, OS-789..."
            />
          </div>

          {movimentando && (
            <div className="bg-muted p-3 rounded-lg text-sm">
              <p>
                Estoque resultante:{" "}
                <span className="font-bold">
                  {movForm.watch("tipo") === "ENTRADA"
                    ? movimentando.quantidade_estoque + (movForm.watch("quantidade") || 0)
                    : movimentando.quantidade_estoque - (movForm.watch("quantidade") || 0)}
                </span>{" "}
                un.
              </p>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Registrando..." : "Registrar Movimentação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InsumosDeleteDialog({
  open,
  onOpenChange,
  deletando,
  salvando,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deletando: Produto | null;
  salvando: boolean;
  onDelete: () => void | Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground">
          Tem certeza que deseja excluir o insumo{" "}
          <strong>{deletando?.nome}</strong>?
        </p>
        <p className="text-sm text-red-500">Esta ação não pode ser desfeita.</p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={salvando}
          >
            {salvando ? "Excluindo..." : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
