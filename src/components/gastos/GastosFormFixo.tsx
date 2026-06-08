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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { FormValidationError } from "@/components/ui/form-validation-error";
import type { GastoFixo, GastosFixosCategoria } from "@/types";

const gastoFixoSchema = z.object({
  nome: z.string().min(1, "Nome é obrigatório"),
  valor: z.coerce.number().positive("Valor deve ser maior que zero"),
  vencimento_dia: z.coerce.number().int().min(1).max(31).optional(),
  categoria: z.enum(["Aluguel", "Energia", "Internet", "Fornecedores", "Folha", "Outros"]),
  ativo: z.boolean().default(true),
});

export type GastoFixoFormData = z.infer<typeof gastoFixoSchema>;

const CATEGORIAS: GastosFixosCategoria[] = [
  "Aluguel",
  "Energia",
  "Internet",
  "Fornecedores",
  "Folha",
  "Outros",
];

interface GastosFormFixoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gasto: GastoFixo | null;
  onSave: (data: Omit<GastoFixo, "id">) => Promise<void>;
  saving: boolean;
}

export function GastosFormFixo({ open, onOpenChange, gasto, onSave, saving }: GastosFormFixoProps) {
  const form = useForm<GastoFixoFormData>({
    resolver: zodResolver(gastoFixoSchema),
    defaultValues: {
      nome: "",
      valor: 0,
      vencimento_dia: undefined,
      categoria: "Outros",
      ativo: true,
    },
  });

  useEffect(() => {
    if (gasto) {
      form.reset({
        nome: gasto.nome,
        valor: gasto.valor,
        vencimento_dia: gasto.vencimento_dia || undefined,
        categoria: gasto.categoria,
        ativo: gasto.ativo ?? true,
      });
    } else {
      form.reset({
        nome: "",
        valor: 0,
        vencimento_dia: undefined,
        categoria: "Outros",
        ativo: true,
      });
    }
  }, [gasto, form]);

  async function onSubmit(data: GastoFixoFormData) {
    await onSave({
      nome: data.nome,
      valor: Number(data.valor),
      vencimento_dia: data.vencimento_dia,
      categoria: data.categoria,
      ativo: data.ativo,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{gasto ? "Editar Gasto Fixo" : "Novo Gasto Fixo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input {...form.register("nome")} placeholder="Ex.: Aluguel do escritório" />
            <FormValidationError message={form.formState.errors.nome?.message} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min={0.01} {...form.register("valor")} />
              <FormValidationError message={form.formState.errors.valor?.message} />
            </div>

            <div className="space-y-2">
              <Label>Vencimento (dia)</Label>
              <Input type="number" min={1} max={31} {...form.register("vencimento_dia")} />
              <FormValidationError message={form.formState.errors.vencimento_dia?.message} />
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

          <div className="flex items-center space-x-2">
            <Checkbox
              id="fixo-ativo"
              checked={form.watch("ativo")}
              onCheckedChange={(checked) => form.setValue("ativo", checked === true)}
            />
            <Label htmlFor="fixo-ativo">Ativo</Label>
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
