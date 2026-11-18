import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAMILIA_COR_CHEIA, statusFamilia, type StatusFamilia } from "@/lib/status-familia";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export interface OpcaoFiltroStatus {
  value: string;
  label: string;
  /** Nome completo, quando `label` é abreviado. */
  titulo?: string;
  /** Cor do ponto, quando o status não é de equipamento (ex.: orçamento de insumos). */
  familia?: StatusFamilia;
}

const TODOS = "TODOS";

function Ponto({ status, familia }: { status: string; familia?: StatusFamilia }) {
  return <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", FAMILIA_COR_CHEIA[familia ?? statusFamilia(status)])} />;
}

/**
 * Filtro de status numa faixa: "Todos" e o fluxo principal rolam se não couberem
 * (o ligado sempre fica à vista); "Outros" (desvios e encerrados) fica fixo à direita.
 * O número só aparece no ligado: é o total que a lista já recebe.
 */
export function FiltroDeStatus({
  principais,
  outros,
  valor,
  total,
  onChange,
  rotulo,
}: {
  principais: OpcaoFiltroStatus[];
  outros: OpcaoFiltroStatus[];
  valor: string;
  total?: number;
  onChange: (valor: string) => void;
  rotulo: string;
}) {
  const faixaRef = useRef<HTMLDivElement>(null);
  const outroLigado = outros.find((opcao) => opcao.value === valor);
  const contador = total != null && (
    <span className="rounded-full bg-acc-soft px-1.5 text-[11px] font-bold tabular-nums text-acc-soft-foreground">{total}</span>
  );

  useEffect(() => {
    const ligado = faixaRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    ligado?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [valor]);

  return (
    <div role="group" aria-label={rotulo} className="flex items-center gap-1 rounded-xl bg-muted p-1">
      <div
        ref={faixaRef}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto pr-4 [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {principais.map((opcao) => {
          const ligado = opcao.value === valor;
          return (
            <button
              key={opcao.value}
              type="button"
              aria-pressed={ligado}
              aria-label={opcao.titulo && opcao.titulo !== opcao.label ? opcao.titulo : undefined}
              title={opcao.titulo}
              onClick={() => onChange(opcao.value)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[13px] md:h-8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                ligado
                  ? "bg-card font-semibold text-foreground shadow-sm"
                  : "font-semibold text-muted-foreground hover:bg-card/50 hover:text-foreground",
              )}
            >
              {opcao.value !== TODOS && <Ponto status={opcao.value} familia={opcao.familia} />}
              {opcao.label}
              {ligado && contador}
            </button>
          );
        })}
      </div>
      {outros.length > 0 && (
        <>
          <span aria-hidden="true" className="h-5 w-px shrink-0 bg-border" />
          <Select value={outroLigado?.value ?? ""} onValueChange={onChange}>
            <SelectTrigger
              aria-label="Outros status"
              className={cn(
                "h-11 w-auto shrink-0 gap-1.5 whitespace-nowrap rounded-lg border-0 md:h-8 px-2.5 text-[13px] shadow-none ring-offset-0 focus:ring-0 focus:ring-offset-0 [&>svg:last-child]:hidden",
                outroLigado
                  ? "bg-card font-semibold text-foreground shadow-sm"
                  : "bg-transparent font-semibold text-muted-foreground hover:bg-card/50 hover:text-foreground",
              )}
            >
              {outroLigado ? (
                <span className="inline-flex items-center gap-1.5">
                  <Ponto status={outroLigado.value} familia={outroLigado.familia} />
                  {outroLigado.label}
                  {contador}
                </span>
              ) : (
                <span>Outros</span>
              )}
              <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden="true" />
            </SelectTrigger>
            <SelectContent align="end">
              {outros.map((opcao) => (
                <SelectItem key={opcao.value} value={opcao.value} className="text-[13px]">
                  <span className="inline-flex items-center gap-2">
                    <Ponto status={opcao.value} familia={opcao.familia} />
                    {opcao.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );
}
