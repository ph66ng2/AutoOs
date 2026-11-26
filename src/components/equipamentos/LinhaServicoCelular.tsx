import { ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { ServicoNecessario } from "@/types";

/**
 * No celular, cada serviço da verificação e do ajuste fica numa linha de 44px; tocar abre a
 * edição dele. Na tela larga os serviços aparecem sempre abertos.
 */
export function LinhaServicoCelular({ servico, onAbrir, mostrarGarantia = true }: { servico: ServicoNecessario; onAbrir: () => void; mostrarGarantia?: boolean }) {
  const pecas = servico.pecas?.length ?? 0;
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`Editar serviço ${servico.descricao || "sem nome"}`}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors duration-rapida hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{servico.descricao || "Serviço sem nome"}</span>
        {pecas > 0 && <span className="block text-xs text-muted-foreground">{pecas === 1 ? "1 peça" : `${pecas} peças`}</span>}
      </span>
      <span className="shrink-0 font-semibold tabular-nums">{mostrarGarantia && Number(servico.valor) === 0 ? "Garantia" : formatCurrency(Number(servico.valor))}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}
