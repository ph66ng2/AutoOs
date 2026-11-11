import { Check, Lock, LockOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PIN_RULES, avaliarPinNovo } from "@/lib/pin-rules";
import { cn } from "@/lib/utils";
import "./pin-lock.css";

/** Quantas regras do PIN novo já foram cumpridas: é quantos roletes do cadeado mostram ✓. */
export function regrasCumpridas(pin: string, confirmacao: string) {
  return Object.values(avaliarPinNovo(pin, confirmacao)).filter(Boolean).length;
}

interface PinCreateFieldsProps {
  idPrefix: string;
  pin: string;
  confirmPin: string;
  onPinChange: (value: string) => void;
  onConfirmPinChange: (value: string) => void;
  pinLabel?: string;
  confirmLabel?: string;
  autoFocus?: boolean;
  /** Centraliza rótulos e texto (tela de escolha de perfil). */
  centered?: boolean;
  inputClassName?: string;
}

const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 8);

/**
 * Campos de PIN novo com as 4 regras. A lista aparece quando a pessoa começa a digitar
 * e, com tudo cumprido, vira uma linha só: "PIN pronto". O cadeado fica na tela que usa
 * este componente, alimentado por `regrasCumpridas`.
 */
export function PinCreateFields({
  idPrefix,
  pin,
  confirmPin,
  onPinChange,
  onConfirmPinChange,
  pinLabel = "Crie seu PIN",
  confirmLabel = "Repita o PIN",
  autoFocus,
  centered,
  inputClassName,
}: PinCreateFieldsProps) {
  const regras = avaliarPinNovo(pin, confirmPin);
  const pronto = Object.values(regras).every(Boolean);
  const comecou = pin.length > 0 || confirmPin.length > 0;
  const LockIcon = pronto ? Lock : LockOpen;
  const field = (id: string, label: string, value: string, onChange: (v: string) => void, focus?: boolean) => (
    <div className="space-y-2">
      <Label htmlFor={id} className={cn(centered && "block text-center")}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          value={value}
          onChange={(event) => onChange(onlyDigits(event.target.value))}
          placeholder="4 a 8 números"
          autoFocus={focus}
          className={cn("h-12 pr-10", inputClassName, "placeholder:text-sm placeholder:font-normal placeholder:tracking-normal")}
        />
        <LockIcon
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors duration-300",
            pronto ? "text-[#22c55e]" : "text-muted-foreground",
          )}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {field(`${idPrefix}-pin`, pinLabel, pin, onPinChange, autoFocus)}
      {field(`${idPrefix}-pin-confirm`, confirmLabel, confirmPin, onConfirmPinChange)}
      <div className={cn("pin-rules", comecou && "pin-rules--open")}>
        <div className="pin-rules__inner">
          {pronto ? (
            <p role="status" className="pin-rules__done flex items-center gap-2 text-sm font-medium text-[#22c55e]">
              <span className="pin-rules__dot pin-rules__dot--ok"><Check className="h-3 w-3" strokeWidth={3.5} /></span>
              PIN pronto
            </p>
          ) : (
            <ul aria-label="Regras do PIN" className="space-y-1.5 text-left">
              {PIN_RULES.map((regra) => {
                const ok = regras[regra.id];
                return (
                  <li key={regra.id} className={cn("flex items-center gap-2 text-sm transition-colors duration-200", ok ? "text-[#22c55e]" : "text-muted-foreground")}>
                    <span className={cn("pin-rules__dot", ok && "pin-rules__dot--ok")}>
                      {ok && <Check className="h-3 w-3" strokeWidth={3.5} />}
                    </span>
                    {regra.label}
                    <span className="sr-only">{ok ? " (cumprida)" : " (pendente)"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
