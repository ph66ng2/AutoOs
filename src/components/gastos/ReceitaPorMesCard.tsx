import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useReceitaPorMes } from "@/hooks/useReceitaPorMes";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Receita aprovada por mês (veio do Início, que deixou de mostrar valores em R$). Uma série, uma cor. */
export function ReceitaPorMesCard() {
  const { data, loading, error } = useReceitaPorMes();
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Receita por mês</CardTitle>
        <p className="text-sm text-muted-foreground">Orçamentos aprovados, pela data de aprovação.</p>
      </CardHeader>
      <CardContent className="h-72">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Carregando…</div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">{error}</p>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados para exibir</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="rotulo" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={(v: number) => moeda.format(v)} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                formatter={(valor: number) => [moeda.format(valor), "Receita"]}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }}
              />
              <Bar dataKey="valor" name="Receita" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
