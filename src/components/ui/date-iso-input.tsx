import { useEffect, useState, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { isoDateToBr, maskDateBr, parseDateBrToIso } from "@/lib/date-utils";

type Props = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (iso: string) => void;
};

/** Campo de data em dd/mm/aaaa; o valor persistido continua YYYY-MM-DD. */
export function DateIsoInput({ value, onValueChange, min, max, onBlur, ...rest }: Props) {
  const iso = (value || "").slice(0, 10);
  const [texto, setTexto] = useState(() => isoDateToBr(iso));

  useEffect(() => {
    setTexto(isoDateToBr(iso));
  }, [iso]);

  return (
    <Input
      {...rest}
      lang="pt-BR"
      inputMode="numeric"
      placeholder="dd/mm/aaaa"
      autoComplete="off"
      value={texto}
      min={min}
      max={max}
      onChange={(event) => {
        const raw = event.target.value;
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
          setTexto(isoDateToBr(raw));
          onValueChange(raw);
          return;
        }
        const next = maskDateBr(raw);
        setTexto(next);
        if (!next) {
          onValueChange("");
          return;
        }
        const parsed = parseDateBrToIso(next);
        if (!parsed) return;
        if (typeof min === "string" && parsed < min.slice(0, 10)) return;
        if (typeof max === "string" && parsed > max.slice(0, 10)) return;
        onValueChange(parsed);
      }}
      onBlur={(event) => {
        setTexto(isoDateToBr(iso));
        onBlur?.(event);
      }}
    />
  );
}
