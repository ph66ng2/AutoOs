import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { GastoFixo } from "@/types";
import { db } from "@/lib/db";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const MESES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface ChartDataPoint {
  label: string;
  total_fixo: number;
  total_variavel: number;
}

interface GastosChartProps {
  mes: number;
  ano: number;
  gastosFixos: GastoFixo[];
}

export function GastosChart({ mes, ano, gastosFixos }: GastosChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      const totalFixo = gastosFixos
        .filter((g) => g.ativo !== false)
        .reduce((sum, g) => sum + (g.valor || 0), 0);

      const data: ChartDataPoint[] = [];
      for (let i = 11; i >= 0; i--) {
        let m = mes - i;
        let a = ano;
        while (m <= 0) {
          m += 12;
          a -= 1;
        }
        try {
          const resumo = await db.resumoMensal(m, a);
          data.push({
            label: `${MESES[m - 1]}/${String(a).slice(2)}`,
            total_fixo: totalFixo,
            total_variavel: resumo?.total_variavel ?? 0,
          });
        } catch {
          data.push({
            label: `${MESES[m - 1]}/${String(a).slice(2)}`,
            total_fixo: totalFixo,
            total_variavel: 0,
          });
        }
      }

      if (!cancelled) {
        setChartData(data);
        setLoading(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [mes, ano, gastosFixos]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evolução de Gastos (12 meses)</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Evolução de Gastos (12 meses)</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Sem dados para exibir
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(v: number) => currencyFormatter.format(v)} />
              <Tooltip
                formatter={(value: number, name: string) => [
                  currencyFormatter.format(value),
                  name === "total_fixo" ? "Fixo" : "Variável",
                ]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="total_fixo"
                name="Fixo"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="total_variavel"
                name="Variável"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
