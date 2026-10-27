import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { parseDecimalBr } from "@/lib/utils";

type Props = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: number;
  onValueChange: (valor: number) => void;
};

function textoDe(valor: number): string {
  if (!Number.isFinite(valor)) return "";
  return String(valor).replace(".", ",");
}

/** Valor em reais: aceita vírgula decimal e ponto de milhar pt-BR (1.234,50). */
export function ValorDecimalInput({ value, onValueChange, ...rest }: Props) {
  const [texto, setTexto] = useState(() => textoDe(value));
  const emitido = useRef(value);

  useEffect(() => {
    if (value === emitido.current) return;
    emitido.current = value;
    setTexto(textoDe(value));
  }, [value]);

  return (
    <Input
      {...rest}
      inputMode="decimal"
      value={texto}
      onChange={(event) => {
        const next = event.target.value;
        setTexto(next);
        const parsed = parseDecimalBr(next);
        if (Number.isFinite(parsed)) {
          emitido.current = parsed;
          onValueChange(parsed);
        }
      }}
      onBlur={() => setTexto(textoDe(value))}
    />
  );
}
