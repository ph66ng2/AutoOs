import type { GastoResumoMensal, GastoFixo, GastoVariavel } from "@/types";

interface GastosSummaryCardsProps {
  resumo: GastoResumoMensal | null;
  gastosFixos: GastoFixo[];
  gastosVariaveis?: GastoVariavel[];
  loading: boolean;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function GastosSummaryCards({ resumo, gastosFixos, gastosVariaveis, loading }: GastosSummaryCardsProps) {
  const totalFixo = gastosFixos
    .filter((g) => g.ativo !== false)
    .reduce((sum, g) => sum + (g.valor || 0), 0);

  const totalVariavel = gastosVariaveis
    ? gastosVariaveis.reduce((sum, g) => sum + (g.valor || 0), 0)
    : resumo?.total_variavel ?? 0;
  const totalGeral = totalFixo + totalVariavel;

  const fixosAtivos = gastosFixos.filter((g) => g.ativo !== false).length;
  const lancamentos = gastosVariaveis?.length ?? 0;
  const cartoes = [
    { rotulo: "Total Fixo", valor: totalFixo, rodape: `${fixosAtivos} ${fixosAtivos === 1 ? "gasto fixo" : "gastos fixos"} no mês`, traco: "bg-status-bad" },
    { rotulo: "Total Variável", valor: totalVariavel, rodape: `${lancamentos} ${lancamentos === 1 ? "lançamento" : "lançamentos"} no mês`, traco: "bg-status-bad/45" },
    { rotulo: "Total Geral", valor: totalGeral, rodape: "fixos e variáveis", traco: "bg-status-bad" },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3" aria-busy={loading || undefined}>
      {cartoes.map((cartao) => (
        <section key={cartao.rotulo} className="overflow-hidden rounded-2xl border bg-card">
          <div className="px-5 pt-4">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${cartao.traco}`} />
              {cartao.rotulo}
            </p>
          </div>
          {loading ? (
            <span aria-hidden="true" className="mx-5 mb-4 mt-2 block h-8 w-36 rounded-lg bg-muted" />
          ) : (
            <p className="px-5 pb-4 pt-1 text-[28px] font-extrabold leading-tight tabular-nums">{currencyFormatter.format(cartao.valor)}</p>
          )}
          <p className="border-t bg-muted/50 px-5 py-2.5 text-xs text-muted-foreground">{loading ? "\u00a0" : cartao.rodape}</p>
        </section>
      ))}
    </div>
  );
}
