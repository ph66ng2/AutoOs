import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormaPagamentoCodigo } from "@/types";

export const FORMA_PAGAMENTO_OPTIONS: Array<{ value: FormaPagamentoCodigo; label: string }> = [
  { value: "PIX", label: "PIX" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CARTAO_CREDITO", label: "Cartão de crédito" },
  { value: "CARTAO_DEBITO", label: "Cartão de débito" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "TRANSFERENCIA", label: "Transferência" },
  { value: "A_COMBINAR", label: "A combinar" },
  { value: "OUTRO", label: "Outro" },
];

interface FormaPagamentoFieldsProps {
  codigo: FormaPagamentoCodigo | "";
  detalhe: string;
  onCodigoChange: (value: FormaPagamentoCodigo | "") => void;
  onDetalheChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}

export function FormaPagamentoFields({
  codigo,
  detalhe,
  onCodigoChange,
  onDetalheChange,
  required = false,
  disabled = false,
}: FormaPagamentoFieldsProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="forma-pagamento-select">Forma de pagamento{required ? " *" : ""}</Label>
      <select
        id="forma-pagamento-select"
        aria-label="Forma de pagamento"
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        value={codigo}
        onChange={(event) => onCodigoChange(event.target.value as FormaPagamentoCodigo | "")}
        disabled={disabled}
      >
        <option value="">Selecione...</option>
        {FORMA_PAGAMENTO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {codigo === "OUTRO" && (
        <Input
          aria-label="Detalhe da forma de pagamento"
          value={detalhe}
          onChange={(event) => onDetalheChange(event.target.value)}
          placeholder="Descreva a forma de pagamento"
          disabled={disabled}
        />
      )}
    </div>
  );
}
