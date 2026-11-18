import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFaturamentoEGastos } from "@/hooks/useFaturamentoEGastos";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const moedaCurta = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

const NOMES: Record<string, string> = { faturado: "Faturado", fixo: "Fixos", variavel: "Variáveis" };

/**
 * Faturado e gastos (fixos + variáveis) dos últimos 12 meses, lado a lado. Cor com sentido:
 * o que entra em verde (ok), o que sai em vermelho (bad); variável é o mesmo vermelho mais claro.
 */
export function FaturamentoEGastosCard({ mes, ano, totalFixo }: { mes: number; ano: number; totalFixo: number }) {
  const { data, loading, error } = useFaturamentoEGastos(mes, ano, totalFixo);
  return (
    <section aria-labelledby="faturamento-gastos-titulo" className="rounded-2xl border bg-card p-5">
      <h2 id="faturamento-gastos-titulo" className="text-base font-bold">Faturamento e gastos</h2>
      {error && <p role="alert" className="mt-2 text-sm text-status-wait">{error}</p>}
      <div className="mt-4 h-72">
        {loading ? (
          <div aria-busy="true" className="flex h-full items-end gap-3 px-2">
            {Array.from({ length: 12 }, (_, indice) => (
              <span key={indice} aria-hidden="true" className="flex-1 rounded-t bg-muted" style={{ height: `${30 + ((indice * 37) % 50)}%` }} />
            ))}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barGap={2}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => moedaCurta.format(v)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                formatter={(valor: number, nome: string) => [moeda.format(valor), NOMES[nome] ?? nome]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }}
              />
              <Legend formatter={(nome: string) => <span className="text-xs text-muted-foreground">{NOMES[nome] ?? nome}</span>} iconType="circle" iconSize={8} />
              <Bar dataKey="faturado" fill="hsl(var(--st-ok))" radius={[4, 4, 0, 0]} maxBarSize={18} />
              <Bar dataKey="fixo" stackId="gastos" fill="hsl(var(--st-bad))" maxBarSize={18} />
              <Bar dataKey="variavel" stackId="gastos" fill="hsl(var(--st-bad) / 0.45)" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
