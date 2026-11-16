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
  Package,
  Plus,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { formatDatePtBr } from "@/lib/date-utils";
import type { Equipamento, Produto } from "@/types";
import { categoriaProdutoLabel } from "@/pages/insumos/insumos-page-constants";
import { PageHeader } from "@/components/PageHeader";
import { etapaOsAtual } from "@/lib/status-familia";
import { StatusBadge } from "@/pages/equipamentos/EquipamentosStatusBadge";


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
      case "RECEBIDO": return { label: "Iniciar verificação", cor: "text-primary" };
      case "AGUARDANDO_APROVACAO": return { label: "Aguardando resposta do cliente", cor: "text-status-wait" };
      case "ORCAMENTO_VENCIDO": return { label: "Orçamento vencido - contatar cliente", cor: "text-destructive" };
      case "PRONTO": return { label: "Pronto para entrega", cor: "text-status-ok" };
      default: return { label: "Pendente", cor: "text-muted-foreground" };
    }
  }


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

  const filaPorEtapa = useMemo(() => {
    const etapas = ["Recebido", "Verificação", "Orçamento", "Manutenção", "Pronto"];
    const contagem = etapas.map(() => 0);
    for (const eq of equipamentos) {
      const indice = etapaOsAtual(eq.status);
      if (indice >= 0 && indice < etapas.length) contagem[indice] += 1;
    }
    return etapas.map((nome, indice) => ({ nome, valor: contagem[indice] }));
  }, [equipamentos]);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const emAtendimento = equipamentos.filter((eq) => eq.status !== "ENTREGUE" && eq.status !== "ABANDONADO");
  const entraramHoje = equipamentos.filter((eq) => (eq.data_entrada ?? "").slice(0, 10) === hoje).length;
  const aguardandoPeca = equipamentos.filter((eq) => eq.status === "AGUARDANDO_PECA").length;
  const cartoes = [
    { titulo: "Em atendimento", valor: emAtendimento.length, rodape: `${entraramHoje} ${entraramHoje === 1 ? "entrou" : "entraram"} hoje`, cor: "bg-primary" },
    { titulo: "Aguardando aprovação", valor: metrics.aguardandoAprovacao, rodape: "Orçamentos com o cliente", cor: "bg-status-wait" },
    { titulo: "Prontos para entrega", valor: metrics.prontos, rodape: "Avisar o cliente e registrar a entrega", cor: "bg-status-ok" },
    { titulo: "Aguardando peça", valor: aguardandoPeca, rodape: "Retomar quando a peça chegar", cor: "bg-status-wait" },
  ];
  const TRACOS = 30;
  const maiorFila = Math.max(1, ...filaPorEtapa.map((etapa) => etapa.valor));

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader titulo="Início" descricao={`${emAtendimento.length} em atendimento`}>
        <Button onClick={() => navigate("/equipamentos")}>
          <Plus className="h-4 w-4 mr-1" />Novo Equipamento
        </Button>
        <Button onClick={() => navigate("/insumos")} variant="outline">
          <Package className="h-4 w-4 mr-1" />Novo Insumo/Peça
        </Button>
      </PageHeader>

      {/* CartaoKPI: número, traços de proporção e o próximo passo no rodapé. Sem valores em R$. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cartoes.map((cartao) => {
          const cheios = Math.round((cartao.valor / Math.max(1, emAtendimento.length)) * TRACOS);
          return (
            <button
              key={cartao.titulo}
              type="button"
              onClick={() => navigate("/equipamentos")}
              className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-colors hover:border-ctl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="space-y-3 p-4">
                <span className="block text-sm font-medium text-muted-foreground">{cartao.titulo}</span>
                <span className="block text-3xl font-extrabold tabular-nums">{cartao.valor}</span>
                <span className="flex gap-[3px]" aria-hidden="true">
                  {Array.from({ length: TRACOS }, (_, i) => (
                    <span key={i} className={`h-7 flex-1 rounded-sm ${i < cheios ? cartao.cor : "bg-track"}`} />
                  ))}
                </span>
              </span>
              <span className="mt-auto flex items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground group-hover:text-foreground">
                <span className="truncate">{cartao.rodape}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Entradas por mês: uma série, uma cor; tooltip por barra. */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-lg">Entradas por mês</CardTitle></CardHeader>
          <CardContent className="h-72">
            {recebidosPorMes.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados para exibir</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={recebidosPorMes} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    formatter={(valor: number) => [valor, "Entradas"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="value" name="Entradas" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Fila por etapa: identidade pelo rótulo; a barra só mostra a quantidade. */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-lg">Fila por etapa</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {filaPorEtapa.map((etapa) => (
                <li key={etapa.nome} className="space-y-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="font-medium">{etapa.nome}</span>
                    <span className="font-semibold tabular-nums">{etapa.valor}</span>
                  </div>
                  <div className="h-2 rounded-full bg-track">
                    <div className="h-2 rounded-full bg-chart-1" style={{ width: `${(etapa.valor / maiorFila) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Pendências (as mesmas de antes) */}
        <Card className="rounded-2xl">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Ações pendentes {acoesPendentes.length > 0 && <span className="ml-1 text-sm font-semibold text-muted-foreground">· {acoesPendentes.length}</span>}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate("/equipamentos")}>Ver todos</Button>
          </CardHeader>
          <CardContent>
            {acoesPendentes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma pendência.</p>
            ) : (
              <ul className="divide-y">
                {acoesPendentes.slice(0, 6).map(eq => {
                  const acao = getAcaoPendente(eq);
                  return (
                    <li key={eq.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-muted/40"
                        onClick={() => navigate("/equipamentos", { state: { equipamentoId: eq.id } })}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{eq.marca} {eq.modelo}</span>
                          <span className={`block truncate text-xs ${acao.cor}`}>{acao.label}{eq.prazo_aprovacao ? ` · prazo ${formatDatePtBr(eq.prazo_aprovacao)}` : ""}</span>
                        </span>
                        <span className="flex min-w-0 max-w-[40%] items-center gap-2 text-xs text-muted-foreground">
                          <span className="hidden truncate sm:inline">{eq.cliente_nome || eq.serial_number}</span>
                          <ArrowRight className="h-4 w-4" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {acoesPendentes.length > 6 && (
              <p className="pt-2 text-center text-xs text-muted-foreground">+ {acoesPendentes.length - 6} outras pendências</p>
            )}
          </CardContent>
        </Card>

        {/* Equipamentos recentes (os mesmos de antes) */}
        <Card className="rounded-2xl">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Equipamentos recentes</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate("/equipamentos")}>Ver todos</Button>
          </CardHeader>
          <CardContent>
            {equipamentosRecentes.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <p>Nenhum equipamento cadastrado</p>
                <Button variant="link" className="mt-1" onClick={() => navigate("/equipamentos")}>Cadastrar primeiro</Button>
              </div>
            ) : (
              <ul className="divide-y">
                {equipamentosRecentes.map(eq => (
                  <li key={eq.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-muted/40"
                      onClick={() => navigate("/equipamentos", { state: { equipamentoId: eq.id } })}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{eq.marca} {eq.modelo}</span>
                        <span className="block truncate text-xs text-muted-foreground">{eq.cliente_nome || eq.serial_number}</span>
                      </span>
                      <span className="shrink-0"><StatusBadge status={eq.status} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Estoque baixo */}
        <Card className="rounded-2xl">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-lg">Estoque baixo {metrics.estoqueBaixo > 0 && <span className="ml-1 text-sm font-semibold text-muted-foreground">· {metrics.estoqueBaixo}</span>}</CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate("/insumos")}>Ver estoque</Button>
          </CardHeader>
          <CardContent>
            {produtosEstoqueBaixo.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhum item com estoque baixo.</p>
            ) : (
              <ul className="divide-y">
                {produtosEstoqueBaixo.map(p => (
                  <li key={p.id} className="space-y-1.5 py-3">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-semibold">{p.nome}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{p.quantidade_estoque} <span className="font-normal text-muted-foreground">/ mín. {p.quantidade_minima}</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-track">
                      <div className="h-2 rounded-full bg-status-bad" style={{ width: `${Math.min(100, (p.quantidade_estoque / Math.max(1, p.quantidade_minima)) * 100)}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{categoriaProdutoLabel(p.categoria)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(date);
}
