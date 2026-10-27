import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { FormValidationError } from "@/components/ui/form-validation-error";
import { parseDecimalBr } from "@/lib/utils";

type Props = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange: (valor: number) => void;
  required?: boolean;
};

function textoDe(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

/** Valor em reais: aceita R$, vírgula decimal e ponto de milhar pt-BR (1.234,50). */
export function ValorDecimalInput({ value, onValueChange, required, ...rest }: Props) {
  const [texto, setTexto] = useState(() => textoDe(value));
  const [erro, setErro] = useState<string | undefined>();
  const emitido = useRef(value);

  useEffect(() => {
    if (erro) return;
    if (value === emitido.current) return;
    emitido.current = value;
    setTexto(textoDe(value));
  }, [value, erro]);

  function emitir(valor: number) {
    emitido.current = valor;
    onValueChange(valor);
  }

  return (
    <>
      <Input
        {...rest}
        inputMode="decimal"
        aria-invalid={Boolean(erro)}
        value={texto}
        onChange={(event) => {
          const next = event.target.value;
          setTexto(next);
          if (next.trim() === "") {
            emitir(0);
            setErro(required ? "Informe um valor." : undefined);
            return;
          }
          const parsed = parseDecimalBr(next);
          if (!Number.isFinite(parsed)) {
            emitir(0);
            setErro("Informe um valor válido.");
            return;
          }
          setErro(undefined);
          emitir(parsed);
        }}
        onBlur={() => {
          if (texto.trim() === "") {
            if (required) {
              setErro("Informe um valor.");
              return;
            }
            setErro(undefined);
            setTexto(textoDe(0));
            return;
          }
          const parsed = parseDecimalBr(texto);
          if (!Number.isFinite(parsed)) {
            setErro("Informe um valor válido.");
            return;
          }
          setErro(undefined);
          setTexto(textoDe(parsed));
        }}
      />
      <FormValidationError message={erro} />
    </>
  );
}
