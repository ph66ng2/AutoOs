/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Dashboard.tsx — Painel Principal com Métricas              ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Página inicial do sistema com visão geral:                  ║
 * ║  - Cards de métricas (total, em manutenção, pendentes, etc) ║
 * ║  - Seção de ações pendentes (por status crítico)            ║
 * ║  - Lista de equipamentos recentes                            ║
 * ║  - Alertas de estoque baixo                                  ║
 * ║  - Gráficos: pizza (status), barras (recebidos/mês),        ║
 * ║    linha (receita/mês)                                       ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - lib/db.ts (listarEquipamentos, listarProdutos)           ║
 * ║  - types/index.ts (STATUS_LABELS, STATUS_COLORS)            ║
 * ║  - recharts (PieChart, BarChart, LineChart)                 ║
 * ║                                                              ║
 * ║  USADO POR: App.tsx (rota /)                                ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Printer,
  Package,
  AlertTriangle,
  Wrench,
  Plus,
  ArrowRight,
  TrendingDown,
  Clock,
  Bell,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { STATUS_LABELS, STATUS_COLORS, type Equipamento, type Produto, type StatusEquipamento } from "@/types";

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as StatusEquipamento] || status;
  const color = STATUS_COLORS[status as StatusEquipamento] || "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

interface DashboardMetrics {
  totalEquipamentos: number;
  recebidos: number;
  emVerificacao: number;
  aguardandoAprovacao: number;
  emManutencao: number;
  prontos: number;
  entregues: number;
  totalProdutos: number;
  estoqueBaixo: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalEquipamentos: 0, recebidos: 0, emVerificacao: 0,
    aguardandoAprovacao: 0, emManutencao: 0, prontos: 0, entregues: 0,
    totalProdutos: 0, estoqueBaixo: 0,
  });
  const [equipamentos, setEquipamentos] = useState<Equipamento[]>([]);
  const [equipamentosRecentes, setEquipamentosRecentes] = useState<Equipamento[]>([]);
  const [produtosEstoqueBaixo, setProdutosEstoqueBaixo] = useState<Produto[]>([]);
  const [acoesPendentes, setAcoesPendentes] = useState<Equipamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [equipamentos, produtos] = await Promise.all([
          db.listarEquipamentos(),
          db.listarProdutos(),
        ]);
        const estoqueBaixo = produtos.filter(p => p.quantidade_estoque < p.quantidade_minima);

        // Ações pendentes: aguardando aprovação, orçamento vencido, prontos para entrega, recebidos sem verificação
        const pendentes = equipamentos.filter(e =>
          e.status === "AGUARDANDO_APROVACAO" ||
          e.status === "ORCAMENTO_VENCIDO" ||
          e.status === "PRONTO" ||
          e.status === "RECEBIDO"
        );

        setMetrics({
          totalEquipamentos: equipamentos.length,
          recebidos: equipamentos.filter(e => e.status === "RECEBIDO").length,
          emVerificacao: equipamentos.filter(e => e.status === "EM_VERIFICACAO").length,
          aguardandoAprovacao: equipamentos.filter(e => e.status === "AGUARDANDO_APROVACAO").length,
          emManutencao: equipamentos.filter(e => e.status === "EM_MANUTENCAO").length,
          prontos: equipamentos.filter(e => e.status === "PRONTO").length,
          entregues: equipamentos.filter(e => e.status === "ENTREGUE").length,
          totalProdutos: produtos.length,
          estoqueBaixo: estoqueBaixo.length,
        });
        setEquipamentos(equipamentos);
        setEquipamentosRecentes(equipamentos.slice(0, 5));
        setProdutosEstoqueBaixo(estoqueBaixo.slice(0, 5));
        setAcoesPendentes(pendentes);
      } catch (err) {
        console.error("Erro ao carregar dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function getAcaoPendente(eq: Equipamento): { label: string; cor: string } {
    switch (eq.status) {
      case "RECEBIDO": return { label: "Iniciar verificação", cor: "text-blue-600" };
      case "AGUARDANDO_APROVACAO": return { label: "Aguardando resposta do cliente", cor: "text-orange-600" };
      case "ORCAMENTO_VENCIDO": return { label: "Orçamento vencido - contatar cliente", cor: "text-red-600" };
      case "PRONTO": return { label: "Pronto para entrega", cor: "text-emerald-600" };
      default: return { label: "Pendente", cor: "text-gray-600" };
    }
  }

  const statusChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    equipamentos.forEach(eq => {
      const key = eq.status || "SEM_STATUS";
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([status, value]) => ({
        status,
        label: STATUS_LABELS[status as StatusEquipamento] || status,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [equipamentos]);

  const recebidosPorMes = useMemo(() => {
    const map = new Map<string, { label: string; value: number }>();
    equipamentos.forEach(eq => {
      const data = parseDate(eq.data_entrada);
      if (!data) return;
      const key = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
      const label = formatMonth(data);
      const current = map.get(key) || { label, value: 0 };
      current.value += 1;
      map.set(key, current);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }, [equipamentos]);

  const receitaPorMes = useMemo(() => {
    const map = new Map<string, { label: string; value: number }>();
    equipamentos.forEach(eq => {
      if (!eq.data_aprovacao) return;
      const data = parseDate(eq.data_aprovacao);
      if (!data) return;
      const valor = eq.valor_orcamento ?? eq.valor_final ?? 0;
      if (!valor) return;
      const key = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
      const label = formatMonth(data);
      const current = map.get(key) || { label, value: 0 };
      current.value += valor;
      map.set(key, current);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }, [equipamentos]);

  const currencyFormatter = useMemo(() => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }), []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do sistema AutoOS</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/equipamentos")} size="sm">
            <Plus className="h-4 w-4 mr-1" />Novo Equipamento
          </Button>
          {/* [BLOQUEIO-TEMPORARIO-INSUMOS] descomente o botão abaixo para restaurar */}
          {/* <Button onClick={() => navigate("/insumos")} variant="outline" size="sm">
            <Package className="h-4 w-4 mr-1" />Novo Insumo/Peça
          </Button> */}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/equipamentos")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Equipamentos</CardTitle>
            <Printer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalEquipamentos}</div>
            <p className="text-xs text-muted-foreground">{metrics.recebidos} recebidos recentemente</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/equipamentos")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Manutenção</CardTitle>
            <Wrench className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{metrics.emManutencao}</div>
            <p className="text-xs text-muted-foreground">{metrics.emVerificacao} em verificação</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/equipamentos")}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aguardando</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{metrics.aguardandoAprovacao}</div>
            <p className="text-xs text-muted-foreground">{metrics.prontos} prontos para entrega</p>
          </CardContent>
        </Card>

        {/* [BLOQUEIO-TEMPORARIO-INSUMOS] remova as 2 linhas de bloqueio e descomente o onClick */}
        <Card
          className={`hover:shadow-md transition-shadow ${metrics.estoqueBaixo > 0 ? "border-red-200 bg-red-50/50" : ""}`}
          // onClick={() => navigate("/insumos")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estoque Baixo</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${metrics.estoqueBaixo > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.estoqueBaixo > 0 ? "text-red-600" : ""}`}>{metrics.estoqueBaixo}</div>
            <p className="text-xs text-muted-foreground">itens abaixo do mínimo</p>
          </CardContent>
        </Card>
      </div>

      {/* Ações Pendentes */}
      {acoesPendentes.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5 text-amber-500" />
                Ações Pendentes
                <Badge variant="secondary" className="ml-1">{acoesPendentes.length}</Badge>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/equipamentos")}>
                Ver todos<ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {acoesPendentes.slice(0, 8).map(eq => {
                const acao = getAcaoPendente(eq);
                return (
                  <div key={eq.id} className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => navigate("/equipamentos", { state: { equipamentoId: eq.id } })}>
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        <StatusBadge status={eq.status} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{eq.marca} {eq.modelo}</p>
                        <p className="text-xs text-muted-foreground">{eq.cliente_nome || eq.serial_number}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-medium ${acao.cor}`}>{acao.label}</p>
                      {eq.prazo_aprovacao && (
                        <p className="text-xs text-muted-foreground">
                          Prazo: {new Date(eq.prazo_aprovacao).toLocaleDateString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {acoesPendentes.length > 8 && (
                <p className="text-xs text-muted-foreground text-center pt-1">
                  + {acoesPendentes.length - 8} outras pendências
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Equipamentos Recentes */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Equipamentos Recentes</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/equipamentos")}>
                Ver todos<ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {equipamentosRecentes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Printer className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Nenhum equipamento cadastrado</p>
                <Button variant="link" className="mt-2" onClick={() => navigate("/equipamentos")}>Cadastrar primeiro</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {equipamentosRecentes.map(eq => (
                  <div key={eq.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => navigate("/equipamentos", { state: { equipamentoId: eq.id } })}>
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{eq.marca} {eq.modelo}</p>
                      <p className="text-xs text-muted-foreground">{eq.cliente_nome || eq.serial_number}</p>
                    </div>
                    <StatusBadge status={eq.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Estoque Baixo */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Alertas de Estoque
                {metrics.estoqueBaixo > 0 && <Badge variant="destructive" className="ml-2">{metrics.estoqueBaixo}</Badge>}
              </CardTitle>
              {/* [BLOQUEIO-TEMPORARIO-INSUMOS] descomente o botão abaixo para restaurar */}
              {/* <Button variant="ghost" size="sm" onClick={() => navigate("/insumos")}>
                Ver todos<ArrowRight className="h-4 w-4 ml-1" />
              </Button> */}
            </div>
          </CardHeader>
          <CardContent>
            {produtosEstoqueBaixo.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>Nenhum item com estoque baixo</p>
              </div>
            ) : (
              <div className="space-y-3">
                {produtosEstoqueBaixo.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50/30">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{p.nome}</p>
                      <p className="text-xs text-muted-foreground">{p.categoria}</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <TrendingDown className="h-3 w-3 text-red-500" />
                        <span className="text-sm font-bold text-red-600">{p.quantidade_estoque}</span>
                        <span className="text-xs text-muted-foreground">/ {p.quantidade_minima}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Graficos */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-lg">Distribuicao por Status</CardTitle></CardHeader>
          <CardContent className="h-64">
            {statusChartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusChartData} dataKey="value" nameKey="label" innerRadius={40} outerRadius={80} paddingAngle={2}>
                    {statusChartData.map((entry, index) => (
                      <Cell key={entry.status} fill={STATUS_CHART_COLORS[index % STATUS_CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => [value, "Equipamentos"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Recebidos por Mes</CardTitle></CardHeader>
          <CardContent className="h-64">
            {recebidosPorMes.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recebidosPorMes} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value: number) => [value, "Equipamentos"]} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Receita por Mes</CardTitle></CardHeader>
          <CardContent className="h-64">
            {receitaPorMes.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Sem dados para exibir
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={receitaPorMes} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" />
                  <YAxis tickFormatter={(value: number) => currencyFormatter.format(value)} />
                  <Tooltip formatter={(value: number) => [currencyFormatter.format(value), "Receita"]} />
                  <Line type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const STATUS_CHART_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#a855f7",
  "#0ea5e9",
  "#22c55e",
];

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(date);
}
