import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { FormValidationError } from "@/components/ui/form-validation-error";
import { parseDecimalBr } from "@/lib/utils";

type Props = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange: (valor: number) => void;
  onValidityChange?: (valido: boolean) => void;
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
export function ValorDecimalInput({
  value,
  onValueChange,
  onValidityChange,
  required,
  ...rest
}: Props) {
  const [texto, setTexto] = useState(() => textoDe(value));
  const [erro, setErro] = useState<string | undefined>();
  const emitido = useRef(value);

  useEffect(() => {
    if (erro) return;
    if (value === emitido.current) return;
    emitido.current = value;
    setTexto(textoDe(value));
  }, [value, erro]);

  function emitirValido(valor: number) {
    emitido.current = valor;
    onValidityChange?.(true);
    onValueChange(valor);
  }

  function marcarInvalido(mensagem: string) {
    setErro(mensagem);
    onValidityChange?.(false);
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
            if (required) {
              marcarInvalido("Informe um valor.");
              return;
            }
            setErro(undefined);
            emitirValido(0);
            return;
          }
          const parsed = parseDecimalBr(next);
          if (!Number.isFinite(parsed)) {
            marcarInvalido("Informe um valor válido.");
            return;
          }
          setErro(undefined);
          emitirValido(parsed);
        }}
        onBlur={() => {
          if (texto.trim() === "") {
            if (required) {
              marcarInvalido("Informe um valor.");
              return;
            }
            setErro(undefined);
            setTexto(textoDe(0));
            return;
          }
          const parsed = parseDecimalBr(texto);
          if (!Number.isFinite(parsed)) {
            marcarInvalido("Informe um valor válido.");
            return;
          }
          setErro(undefined);
          onValidityChange?.(true);
          setTexto(textoDe(parsed));
        }}
      />
      <FormValidationError message={erro} />
    </>
  );
}
