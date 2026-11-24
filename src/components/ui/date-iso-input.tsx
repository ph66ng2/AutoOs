import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Calendario, atalhosPadrao, type AtalhoData } from "@/components/ui/calendario";
import { isoDateToBr, maskDateBr, parseDateBrToIso } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (iso: string) => void;
  /** Atalhos no rodapé do calendário: "data" (Hoje), "prazo" (Amanhã, 3 dias úteis, 7 dias) ou uma lista. */
  atalhos?: "data" | "prazo" | AtalhoData[];
  /** Classe do contorno (largura). Por padrão a largura é de uma data, não a linha inteira. */
  wrapperClassName?: string;
};

/**
 * Campo de data: digita dd/mm/aaaa ou escolhe no calendário (ícone, ou Alt+↓ no campo).
 * O valor persistido continua YYYY-MM-DD.
 */
export function DateIsoInput({ value, onValueChange, min, max, onBlur, onKeyDown, atalhos = "data", wrapperClassName, className, disabled, ...rest }: Props) {
  const iso = (value || "").slice(0, 10);
  const [texto, setTexto] = useState(() => isoDateToBr(iso));
  const [aberto, setAberto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const grade = useRef<HTMLDivElement>(null);
  /** Fechou escolhendo um dia ou com Esc: o foco volta ao campo. Clique fora mantém o foco onde a pessoa clicou. */
  const devolverFoco = useRef(false);
  /** Quantos dígitos ficam antes do cursor depois da máscara (a "/" inserida não pode empurrar o cursor para trás). */
  const digitosAntesDoCursor = useRef<number | null>(null);

  useLayoutEffect(() => {
    const alvo = digitosAntesDoCursor.current;
    const el = campo.current;
    digitosAntesDoCursor.current = null;
    if (alvo == null || !el || document.activeElement !== el) return;
    let pos = 0;
    let vistos = 0;
    while (pos < texto.length && vistos < alvo) {
      if (/\d/.test(texto[pos])) vistos += 1;
      pos += 1;
    }
    // Logo depois de completar dia ou mês, o cursor passa a barra.
    if (texto[pos] === "/" && vistos === alvo && alvo > 0) pos += 1;
    el.setSelectionRange(pos, pos);
  }, [texto]);

  useEffect(() => {
    setTexto(isoDateToBr(iso));
  }, [iso]);

  const minIso = typeof min === "string" ? min.slice(0, 10) : undefined;
  const maxIso = typeof max === "string" ? max.slice(0, 10) : undefined;
  const listaDeAtalhos = Array.isArray(atalhos) ? atalhos : atalhosPadrao(atalhos);

  const escolher = (escolhido: string) => {
    setTexto(isoDateToBr(escolhido));
    onValueChange(escolhido);
    devolverFoco.current = true;
    setAberto(false);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverAnchor asChild>
        <div className={cn("relative w-full max-w-[13rem]", wrapperClassName)}>
          <Input
            {...rest}
            ref={campo}
            disabled={disabled}
            lang="pt-BR"
            inputMode="numeric"
            placeholder="dd/mm/aaaa"
            autoComplete="off"
            value={texto}
            min={min}
            max={max}
            className={cn("pr-10 tabular-nums", className)}
            onKeyDown={(event) => {
              if (event.altKey && event.key === "ArrowDown") {
                event.preventDefault();
                setAberto(true);
              }
              onKeyDown?.(event);
            }}
            onChange={(event) => {
              const raw = event.target.value;
              if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
                setTexto(isoDateToBr(raw));
                onValueChange(raw);
                return;
              }
              const next = maskDateBr(raw);
              const cursor = event.target.selectionStart ?? raw.length;
              digitosAntesDoCursor.current = Math.min(raw.slice(0, cursor).replace(/\D/g, "").length, 8);
              setTexto(next);
              if (!next) {
                onValueChange("");
                return;
              }
              const parsed = parseDateBrToIso(next);
              if (!parsed) return;
              if (minIso && parsed < minIso) return;
              if (maxIso && parsed > maxIso) return;
              onValueChange(parsed);
            }}
            onBlur={(event) => {
              setTexto(isoDateToBr(iso));
              onBlur?.(event);
            }}
          />
          <button
            type="button"
            disabled={disabled}
            aria-label="Abrir calendário"
            aria-expanded={aberto}
            aria-haspopup="dialog"
            title="Abrir calendário (Alt+↓)"
            onClick={() => setAberto((estava) => !estava)}
            className={cn(
              "absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors duration-rapida",
              "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
              aberto && "bg-muted text-foreground",
            )}
          >
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </PopoverAnchor>
      <PopoverContent
        aria-label="Escolher data"
        collisionPadding={12}
        onOpenAutoFocus={(evento) => {
          // Foca o dia ativo da grade, não o primeiro botão (mês anterior).
          evento.preventDefault();
          requestAnimationFrame(() => grade.current?.querySelector<HTMLButtonElement>('[role="grid"] button[tabindex="0"]')?.focus());
        }}
        onEscapeKeyDown={() => {
          devolverFoco.current = true;
        }}
        onCloseAutoFocus={(evento) => {
          evento.preventDefault();
          if (devolverFoco.current) campo.current?.focus();
          devolverFoco.current = false;
        }}
      >
        <div ref={grade}>
          <Calendario valor={iso} onEscolher={escolher} min={minIso} max={maxIso} atalhos={listaDeAtalhos} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
