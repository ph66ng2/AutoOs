import { cn } from "@/lib/utils";

export interface OpcaoFiltroStatus {
  value: string;
  label: string;
}

/**
 * Chips de status, um ligado por vez. O número só aparece no chip ligado: é o
 * total que a lista já recebe do backend; a contagem por status não existe hoje.
 */
export function FiltroDeStatus({
  opcoes,
  valor,
  total,
  onChange,
  rotulo,
}: {
  opcoes: OpcaoFiltroStatus[];
  valor: string;
  total?: number;
  onChange: (valor: string) => void;
  rotulo: string;
}) {
  return (
    <div role="group" aria-label={rotulo} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
      {opcoes.map((opcao) => {
        const ligado = opcao.value === valor;
        return (
          <button
            key={opcao.value}
            type="button"
            aria-pressed={ligado}
            onClick={() => onChange(opcao.value)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ligado
                ? "bg-foreground text-background"
                : "bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--ctl))] hover:bg-muted",
            )}
          >
            {opcao.label}
            {ligado && total != null && (
              <span className="rounded-full bg-background/20 px-2 text-xs font-semibold tabular-nums">{total}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
