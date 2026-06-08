import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormValidationError } from "@/components/ui/form-validation-error";
import type { GastoVariavel, GastoVariavelInput, GastosFixosCategoria } from "@/types";

const gastoVariavelSchema = z.object({
  descricao: z.string().min(1, "Descrição é obrigatória"),
  valor: z.coerce.number().positive("Valor deve ser maior que zero"),
  data: z.string().min(1, "Data é obrigatória"),
  categoria: z.enum(["Aluguel", "Energia", "Internet", "Fornecedores", "Folha", "Outros"]),
  nota: z.string().optional(),
});

export type GastoVariavelFormData = z.infer<typeof gastoVariavelSchema>;

const CATEGORIAS: GastosFixosCategoria[] = [
  "Aluguel",
  "Energia",
  "Internet",
  "Fornecedores",
  "Folha",
  "Outros",
];

interface GastosFormVariavelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: GastoVariavel | null;
  onSave: (data: GastoVariavelInput) => Promise<void>;
  saving: boolean;
}

export function GastosFormVariavel({
  open,
  onOpenChange,
  gasto,
  onSave,
  saving,
}: GastosFormVariavelProps) {
  const form = useForm<GastoVariavelFormData>({
    resolver: zodResolver(gastoVariavelSchema),
    defaultValues: {
      descricao: "",
      valor: 0,
      data: new Date().toISOString().split("T")[0],
      categoria: "Outros",
      nota: "",
    },
  });

  useEffect(() => {
    if (gasto) {
      form.reset({
        descricao: gasto.descricao,
        valor: gasto.valor,
        data: gasto.data || new Date().toISOString().split("T")[0],
        categoria: gasto.categoria,
        nota: gasto.nota || "",
      });
    } else {
      form.reset({
        descricao: "",
        valor: 0,
        data: new Date().toISOString().split("T")[0],
        categoria: "Outros",
        nota: "",
      });
    }
  }, [gasto, form]);

  async function onSubmit(data: GastoVariavelFormData) {
    await onSave({
      descricao: data.descricao,
      valor: Number(data.valor),
      data: data.data,
      categoria: data.categoria,
      nota: data.nota || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{gasto ? "Editar Gasto Variável" : "Novo Gasto Variável"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Descrição *</Label>
            <Input {...form.register("descricao")} placeholder="Ex.: Compra de toner" />
            <FormValidationError message={form.formState.errors.descricao?.message} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min={0.01} {...form.register("valor")} />
              <FormValidationError message={form.formState.errors.valor?.message} />
            </div>

            <div className="space-y-2">
              <Label>Data *</Label>
              <Input type="date" {...form.register("data")} />
              <FormValidationError message={form.formState.errors.data?.message} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select
              value={form.watch("categoria")}
              onValueChange={(v) => form.setValue("categoria", v as GastosFixosCategoria)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormValidationError message={form.formState.errors.categoria?.message} />
          </div>

          <div className="space-y-2">
            <Label>Nota / Observação</Label>
            <Textarea {...form.register("nota")} rows={2} placeholder="Observações opcionais..." />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando..." : gasto ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
