import type { CategoriaValor } from "@/types";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Gastos do mês por categoria (resumo mensal do backend), do maior para o menor. */
export function GastosPorCategoria({ categorias, loading }: { categorias: CategoriaValor[]; loading: boolean }) {
  const ordenadas = [...categorias].filter((item) => item.valor > 0).sort((a, b) => b.valor - a.valor);
  const maior = ordenadas[0]?.valor ?? 0;
  return (
    <section aria-labelledby="por-categoria-titulo" className="rounded-2xl border bg-card p-5">
      <h2 id="por-categoria-titulo" className="text-base font-bold">Por categoria</h2>
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">Carregando…</p>
      ) : ordenadas.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum gasto neste mês.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {ordenadas.map((item) => (
            <li key={item.categoria}>
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span>{item.categoria}</span>
                <span className="font-semibold tabular-nums">{moeda.format(item.valor)}</span>
              </p>
              <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-track">
                <span className="block h-full rounded-full bg-status-bad" style={{ width: `${maior ? (item.valor / maior) * 100 : 0}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
