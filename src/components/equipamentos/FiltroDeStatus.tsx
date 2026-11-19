import type React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export interface OpcaoFiltroStatus {
  value: string;
  label: string;
  /** Nome completo, quando `label` é abreviado. */
  titulo?: string;
}

const TODOS = "TODOS";

/** Pílula de filtro do canvas: contorno fino, escura quando ligada, com o número ao lado do nome. */
export function PilulaFiltro({
  ligado,
  rotulo,
  numero,
  titulo,
  onClick,
}: {
  ligado: boolean;
  rotulo: string;
  numero?: number;
  titulo?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={ligado}
      title={titulo}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full pl-3 text-[13px] font-semibold transition-colors duration-rapida focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8",
        numero == null ? "pr-3" : "pr-2",
        ligado ? "bg-foreground text-background" : "bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--ctl))] hover:bg-muted",
      )}
    >
      {rotulo}
      {numero != null && (
        <span className={cn("rounded-full px-2 text-xs font-semibold tabular-nums", ligado ? "bg-background/20" : "bg-secondary text-muted-foreground")}>
          {numero}
        </span>
      )}
    </button>
  );
}

/**
 * Filtro de status em pílulas, como no canvas: cada uma com o seu número.
 * `contagens` traz o total por status (com a busca aplicada); "Todos" é a soma.
 * `outros` (encerrados que quase ninguém filtra) ficam num menu à direita.
 * Com `multiplo`, Ctrl/Shift+clique soma ou tira um status e `valor` vira uma lista
 * separada por vírgula ("RECEBIDO,EM_VERIFICACAO"); o clique simples continua trocando.
 */
export function FiltroDeStatus({
  principais,
  outros = [],
  valor,
  contagens,
  onChange,
  rotulo,
  multiplo = false,
}: {
  principais: OpcaoFiltroStatus[];
  outros?: OpcaoFiltroStatus[];
  valor: string;
  contagens?: Record<string, number> | null;
  onChange: (valor: string) => void;
  rotulo: string;
  multiplo?: boolean;
}) {
  const selecionados = valor.split(",").map((item) => item.trim()).filter(Boolean);
  const ligado = (status: string) => (status === TODOS ? selecionados.length === 0 || valor === TODOS : selecionados.includes(status));
  const escolher = (status: string, event?: React.MouseEvent) => {
    const somar = multiplo && status !== TODOS && !!event && (event.ctrlKey || event.metaKey || event.shiftKey);
    if (!somar) return onChange(status);
    const base = selecionados.filter((item) => item !== TODOS);
    const proximo = base.includes(status) ? base.filter((item) => item !== status) : [...base, status];
    onChange(proximo.length ? proximo.join(",") : TODOS);
  };
  const numero = (status: string) => {
    if (!contagens) return undefined;
    if (status === TODOS) return Object.values(contagens).reduce((soma, n) => soma + n, 0);
    return contagens[status] ?? 0;
  };
  const outroLigado = outros.find((opcao) => selecionados.includes(opcao.value));

  return (
    <div role="group" aria-label={rotulo} className="flex flex-wrap items-center gap-2">
      {principais.map((opcao) => (
        <PilulaFiltro
          key={opcao.value}
          ligado={ligado(opcao.value)}
          rotulo={opcao.label}
          titulo={multiplo && opcao.value !== TODOS ? `${opcao.titulo ?? opcao.label} · Ctrl+clique para combinar` : opcao.titulo}
          numero={numero(opcao.value)}
          onClick={(event) => escolher(opcao.value, event)}
        />
      ))}
      {outros.length > 0 && (
        <Select value={outroLigado?.value ?? ""} onValueChange={onChange}>
          <SelectTrigger
            aria-label="Outros status"
            className={cn(
              "h-11 w-auto shrink-0 gap-2 whitespace-nowrap rounded-full border-0 px-3 text-[13px] font-semibold md:h-8 ring-offset-0 focus:ring-2 focus:ring-ring focus:ring-offset-0 [&>svg:last-child]:hidden",
              outroLigado ? "bg-foreground text-background" : "bg-card text-muted-foreground shadow-[inset_0_0_0_1px_hsl(var(--ctl))] hover:bg-muted",
            )}
          >
            {outroLigado ? (
              <span className="inline-flex items-center gap-2">
                {outroLigado.label}
                {numero(outroLigado.value) != null && (
                  <span className="rounded-full bg-background/20 px-2 text-xs tabular-nums">{numero(outroLigado.value)}</span>
                )}
              </span>
            ) : (
              <span>Outros</span>
            )}
            <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
          </SelectTrigger>
          <SelectContent align="end">
            {outros.map((opcao) => (
              <SelectItem key={opcao.value} value={opcao.value} className="text-[13px]">
                {opcao.label}
                {numero(opcao.value) != null && <span className="ml-2 tabular-nums text-muted-foreground">{numero(opcao.value)}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
