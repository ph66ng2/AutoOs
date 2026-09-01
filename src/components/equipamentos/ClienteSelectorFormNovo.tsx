import { Check, Loader2, Plus, X } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { ClienteFormularioCampos } from "@/components/clientes/ClienteFormularioCampos";
import type { ClienteFormData } from "@/lib/validations";

export function ClienteSelectorFormNovo({
  form,
  tipoPessoa,
  buscarCep,
  buscandoCep,
  salvandoNovo,
  onVoltarBusca,
  onSalvar,
  touchMode = false,
}: {
  form: UseFormReturn<ClienteFormData>;
  tipoPessoa: "PF" | "PJ" | null;
  buscarCep: (cep: string) => void | Promise<void>;
  buscandoCep: boolean;
  salvandoNovo: boolean;
  onVoltarBusca: () => void;
  onSalvar: () => void;
  touchMode?: boolean;
}) {
  return (
    <div className={`flex min-h-0 flex-col gap-4 rounded-lg border bg-accent/20 ${touchMode ? "p-6 [&_input]:min-h-12 [&_input]:text-base [&_textarea]:min-h-12 [&_textarea]:text-base [&_button]:min-h-12 [&_button]:text-base" : "max-h-[min(560px,72vh)] p-4"}`}>
      <div className="flex shrink-0 items-center justify-between">
        <h3 className={`flex items-center gap-2 font-semibold ${touchMode ? "text-xl" : "text-sm"}`}>
          <Plus className={touchMode ? "h-6 w-6" : "h-4 w-4"} /> Novo Cliente
        </h3>
        <Button type="button" variant="ghost" size="icon" className={touchMode ? "h-12 w-12" : "h-7 w-7"} onClick={onVoltarBusca}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className={touchMode ? "flex-1" : "min-h-0 flex-1 overflow-y-auto pr-1"}>
        <ClienteFormularioCampos
          form={form}
          tipoPessoa={tipoPessoa}
          buscarCep={buscarCep}
          buscandoCep={buscandoCep}
        />
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" size={touchMode ? "default" : "sm"} onClick={onVoltarBusca}>
          Cancelar
        </Button>
        <Button
          type="button"
          size={touchMode ? "default" : "sm"}
          disabled={salvandoNovo}
          onClick={onSalvar}
        >
          {salvandoNovo ? (
            <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Salvando...</>
          ) : (
            <><Check className="h-4 w-4 mr-1" />Cadastrar e Vincular</>
          )}
        </Button>
      </div>
    </div>
  );
}
