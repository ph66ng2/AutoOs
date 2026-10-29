import {
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormValidationError } from "@/components/ui/form-validation-error";
import { Input } from "@/components/ui/input";
import { ValorDecimalInput } from "@/components/ui/valor-decimal-input";
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
import type { Produto, UsoProdutoOrcamentos } from "@/types";
import { CATEGORIA_OPTIONS, MINIMO_POR_CATEGORIA } from "./insumos-page-constants";

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
            {editando ? "Editar Insumo/Peça" : "Novo Insumo/Peça"}
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
                  <Select
                    value={field.value}
                    onValueChange={(categoria) => {
                      field.onChange(categoria);
                      if (!editando) {
                        form.setValue("quantidade_minima", MINIMO_POR_CATEGORIA[categoria], {
                          shouldValidate: true,
                        });
                      }
                    }}
                  >
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
              <ValorDecimalInput
                min={0}
                value={Number(form.watch("preco_custo")) || 0}
                onValueChange={(valor) => form.setValue("preco_custo", valor, { shouldValidate: true, shouldDirty: true })}
              />
            </div>
            <div className="space-y-2">
              <Label>Preço Venda</Label>
              <ValorDecimalInput
                min={0}
                value={Number(form.watch("preco_venda")) || 0}
                onValueChange={(valor) => form.setValue("preco_venda", valor, { shouldValidate: true, shouldDirty: true })}
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

const USO_GRUPOS: { chave: keyof UsoProdutoOrcamentos; rotulo: string }[] = [
  { chave: "os_em_aberto", rotulo: "OS com orçamento ainda não decidido" },
  { chave: "os_baixa_pendente", rotulo: "OS aprovadas com baixa pendente" },
  { chave: "orcamentos_insumos", rotulo: "Orçamentos de insumos em aberto" },
];

export function InsumosDeleteDialog({
  open,
  onOpenChange,
  deletando,
  salvando,
  onDelete,
  uso = null,
  carregandoUso = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deletando: Produto | null;
  salvando: boolean;
  onDelete: () => void | Promise<void>;
  uso?: UsoProdutoOrcamentos | null;
  carregandoUso?: boolean;
}) {
  const gruposComItens = uso
    ? USO_GRUPOS.filter((grupo) => uso[grupo.chave].length > 0)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground">
          Tem certeza que deseja excluir o insumo/peça{" "}
          <strong>{deletando?.nome}</strong>?
        </p>
        {gruposComItens.length > 0 && uso && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Esta peça está em orçamentos em andamento</p>
            {gruposComItens.map((grupo) => (
              <div key={grupo.chave} className="mt-2">
                <p className="font-medium">{grupo.rotulo}</p>
                <ul className="list-disc pl-5">
                  {uso[grupo.chave].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="mt-2">
              Depois de excluir, a aprovação e a baixa dessas peças vão falhar até a
              peça ser trocada ou retirada do orçamento.
            </p>
          </div>
        )}
        <p className="text-sm text-red-500">Esta ação não pode ser desfeita.</p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={salvando || carregandoUso}
          >
            {salvando ? "Excluindo..." : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
