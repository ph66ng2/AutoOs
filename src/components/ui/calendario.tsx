import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type AtalhoData = { rotulo: string; iso: string };

const DIAS_DA_SEMANA = [
  ["D", "domingo"],
  ["S", "segunda-feira"],
  ["T", "terça-feira"],
  ["Q", "quarta-feira"],
  ["Q", "quinta-feira"],
  ["S", "sexta-feira"],
  ["S", "sábado"],
] as const;

export const paraIso = (data: Date) => format(data, "yyyy-MM-dd");

function deIso(iso: string | undefined | null): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const data = parseISO(iso.slice(0, 10));
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Soma dias úteis (seg a sex) a partir de `base`. */
export function somarDiasUteis(base: Date, dias: number): Date {
  let data = base;
  let faltam = dias;
  while (faltam > 0) {
    data = addDays(data, 1);
    if (data.getDay() !== 0 && data.getDay() !== 6) faltam -= 1;
  }
  return data;
}

/** Atalhos prontos: `data` (só Hoje) e `prazo` (para prazos dados ao cliente). */
export function atalhosPadrao(tipo: "data" | "prazo", hoje = new Date()): AtalhoData[] {
  if (tipo === "prazo") {
    return [
      { rotulo: "Amanhã", iso: paraIso(addDays(hoje, 1)) },
      { rotulo: "Em 3 dias úteis", iso: paraIso(somarDiasUteis(hoje, 3)) },
      { rotulo: "Em 7 dias", iso: paraIso(addDays(hoje, 7)) },
    ];
  }
  return [{ rotulo: "Hoje", iso: paraIso(hoje) }];
}

/**
 * Calendário de um mês, no desenho do design system: o dia escolhido é o único com a cor de
 * destaque; hoje tem só um anel neutro. Teclado: setas andam pelos dias, PgUp/PgDn trocam de
 * mês, Home/End vão ao início/fim da semana, Enter escolhe.
 */
export function Calendario({
  valor,
  onEscolher,
  min,
  max,
  atalhos = [],
  hoje = new Date(),
}: {
  /** Data escolhida, YYYY-MM-DD. */
  valor?: string | null;
  onEscolher: (iso: string) => void;
  min?: string;
  max?: string;
  atalhos?: AtalhoData[];
  hoje?: Date;
}) {
  const escolhida = deIso(valor);
  // O dia ativo fica sempre dentro do intervalo permitido: uma data vencida (ex.: prazo a prorrogar)
  // não pode deixar o foco num dia desabilitado, senão o teclado não alcança nenhum dia válido.
  const limitar = (data: Date) => {
    const iso = paraIso(data);
    if (min && iso < min.slice(0, 10)) return parseISO(min.slice(0, 10));
    if (max && iso > max.slice(0, 10)) return parseISO(max.slice(0, 10));
    return data;
  };
  const [foco, setFoco] = useState<Date>(() => limitar(escolhida ?? hoje));
  const [mes, setMes] = useState<Date>(() => startOfMonth(limitar(escolhida ?? hoje)));
  const grade = useRef<HTMLDivElement>(null);
  const moverFocoDoTeclado = useRef(false);

  const foraDoLimite = (data: Date) => {
    const iso = paraIso(data);
    return (min ? iso < min.slice(0, 10) : false) || (max ? iso > max.slice(0, 10) : false);
  };

  // O foco do teclado acompanha o dia ativo (só depois de uma tecla, para não roubar o foco ao abrir).
  useEffect(() => {
    if (!moverFocoDoTeclado.current) return;
    moverFocoDoTeclado.current = false;
    grade.current?.querySelector<HTMLButtonElement>(`[data-dia="${paraIso(foco)}"]`)?.focus();
  }, [foco, mes]);

  const irPara = (alvo: Date) => {
    const data = limitar(alvo);
    moverFocoDoTeclado.current = true;
    setFoco(data);
    if (!isSameMonth(data, mes)) setMes(startOfMonth(data));
  };

  // Trocar de mês pelos botões leva junto o dia ativo, para a grade continuar alcançável pelo Tab.
  const trocarMes = (passo: number) => {
    const proximo = limitar(addMonths(foco, passo));
    setFoco(proximo);
    setMes(startOfMonth(proximo));
  };

  const aoTeclar = (evento: KeyboardEvent<HTMLDivElement>) => {
    const passos: Record<string, () => Date> = {
      ArrowLeft: () => addDays(foco, -1),
      ArrowRight: () => addDays(foco, 1),
      ArrowUp: () => addDays(foco, -7),
      ArrowDown: () => addDays(foco, 7),
      PageUp: () => addMonths(foco, -1),
      PageDown: () => addMonths(foco, 1),
      Home: () => startOfWeek(foco),
      End: () => endOfWeek(foco),
    };
    const passo = passos[evento.key];
    if (!passo) return;
    evento.preventDefault();
    irPara(passo());
  };

  const inicio = startOfWeek(startOfMonth(mes));
  // Só as semanas que têm dias do mês (4 a 6): sem linha inteira do mês seguinte.
  const semanas = Math.ceil((differenceInCalendarDays(endOfMonth(mes), inicio) + 1) / 7);
  const dias = Array.from({ length: semanas * 7 }, (_, i) => addDays(inicio, i));
  const titulo = format(mes, "MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="w-[16.25rem] select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() => trocarMes(-1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-rapida hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p aria-live="polite" className="text-sm font-semibold first-letter:uppercase">{titulo}</p>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() => trocarMes(1)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-rapida hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div ref={grade} role="grid" aria-label={titulo} onKeyDown={aoTeclar}>
        <div role="row" className="grid grid-cols-7">
          {DIAS_DA_SEMANA.map(([letra, nome], i) => (
            <span key={i} role="columnheader" aria-label={nome} className="flex h-8 items-center justify-center text-[11px] font-semibold text-muted-foreground">
              {letra}
            </span>
          ))}
        </div>
        {Array.from({ length: semanas }, (_, semana) => (
          <div key={semana} role="row" className="grid grid-cols-7 gap-y-0.5">
            {dias.slice(semana * 7, semana * 7 + 7).map((dia) => {
              const iso = paraIso(dia);
              const selecionado = escolhida != null && isSameDay(dia, escolhida);
              const deHoje = isSameDay(dia, hoje);
              const doMes = isSameMonth(dia, mes);
              const bloqueado = foraDoLimite(dia);
              return (
                <div key={iso} role="gridcell" aria-selected={selecionado} className="flex items-center justify-center">
                  <button
                    type="button"
                    data-dia={iso}
                    tabIndex={isSameDay(dia, foco) ? 0 : -1}
                    disabled={bloqueado}
                    aria-current={deHoje ? "date" : undefined}
                    aria-label={format(dia, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    onClick={() => onEscolher(iso)}
                    onKeyDown={(evento) => {
                      if (evento.key === "Enter" || evento.key === " ") {
                        evento.preventDefault();
                        if (!bloqueado) onEscolher(iso);
                      }
                    }}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-sm tabular-nums transition-colors duration-rapida",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-popover",
                      selecionado
                        ? "bg-primary font-semibold text-primary-foreground"
                        : cn(
                            "hover:bg-muted",
                            doMes ? "text-foreground" : "text-muted-foreground/60",
                            deHoje && "font-semibold ring-1 ring-inset ring-border",
                          ),
                      bloqueado && "cursor-not-allowed opacity-35 hover:bg-transparent",
                    )}
                  >
                    {format(dia, "d")}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {atalhos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t pt-2.5">
          {atalhos.map((atalho) => {
            const bloqueado = foraDoLimite(parseISO(atalho.iso));
            return (
              <button
                key={atalho.rotulo}
                type="button"
                disabled={bloqueado}
                onClick={() => onEscolher(atalho.iso)}
                className="h-7 rounded-lg border px-2.5 text-xs font-medium transition-colors duration-rapida hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
              >
                {atalho.rotulo}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
