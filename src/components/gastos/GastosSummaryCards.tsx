import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GastoResumoMensal, GastoFixo } from "@/types";

interface GastosSummaryCardsProps {
  resumo: GastoResumoMensal | null;
  gastosFixos: GastoFixo[];
  loading: boolean;
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function GastosSummaryCards({ resumo, gastosFixos, loading }: GastosSummaryCardsProps) {
  const totalFixo = gastosFixos
    .filter((g) => g.ativo !== false)
    .reduce((sum, g) => sum + (g.valor || 0), 0);

  const totalVariavel = resumo?.total_variavel ?? 0;
  const totalGeral = totalFixo + totalVariavel;

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Fixo
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-blue-600">
            {currencyFormatter.format(totalFixo)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Variável
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600">
            {currencyFormatter.format(totalVariavel)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Geral
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {currencyFormatter.format(totalGeral)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
