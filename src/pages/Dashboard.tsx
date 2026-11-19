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
  Plus,
  ArrowRight,
  CalendarDays,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { movimentoDaBancada, saudacao, variacaoPercentual } from "@/lib/inicio";
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
  const { status: sessao } = useSensitiveAccess();
  const agora = new Date();
  const [mesSel, setMesSel] = useState({ ano: agora.getFullYear(), mes: agora.getMonth() + 1 });

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


  const movimento = useMemo(() => movimentoDaBancada(equipamentos, mesSel.ano), [equipamentos, mesSel.ano]);
  /** O mês anterior pode cair no ano passado (janeiro compara com dezembro). */
  const movimentoAnoAnterior = useMemo(() => movimentoDaBancada(equipamentos, mesSel.ano - 1), [equipamentos, mesSel.ano]);

  const filaPorEtapa = useMemo(() => {
    const etapas = ["Recebido", "Verificação", "Orçamento", "Manutenção", "Pronto"];
    const contagem = etapas.map(() => 0);
    for (const eq of equipamentos) {
      const indice = etapaOsAtual(eq.status);
      if (indice >= 0 && indice < etapas.length) contagem[indice] += 1;
    }
    return etapas.map((nome, indice) => ({ nome, valor: contagem[indice], cor: COR_ETAPA[indice] }));
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
  const primeiroNome = (sessao?.active_profile_name ?? "").trim().split(/\s+/)[0] ?? "";
  const ultimosMeses = Array.from({ length: 12 }, (_, i) => {
    const data = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    return { ano: data.getFullYear(), mes: data.getMonth() + 1 };
  });
  const doMes = movimento[mesSel.mes - 1];
  const doMesAnterior = mesSel.mes === 1 ? movimentoAnoAnterior[11] : movimento[mesSel.mes - 2];
  const naFila = filaPorEtapa.reduce((soma, etapa) => soma + etapa.valor, 0);
  const resumoMovimento = [
    { rotulo: "Entraram", valor: doMes.entraram, variacao: variacaoPercentual(doMes.entraram, doMesAnterior.entraram), cor: "text-primary" },
    { rotulo: "Entregues", valor: doMes.entregues, variacao: variacaoPercentual(doMes.entregues, doMesAnterior.entregues), cor: "text-status-ok" },
    { rotulo: "Reprovados", valor: doMes.reprovados, variacao: null, cor: "text-status-bad" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader titulo={`${saudacao(agora.getHours())}${primeiroNome ? `, ${primeiroNome}` : ""}`}>
        <Select value={`${mesSel.ano}-${mesSel.mes}`} onValueChange={(valor) => { const [a, m] = valor.split("-").map(Number); setMesSel({ ano: a, mes: m }); }}>
          <SelectTrigger aria-label="Mês" className="h-10 w-auto gap-2 px-3 font-semibold">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            <span>{nomeMes(mesSel.mes)}, {mesSel.ano}</span>
          </SelectTrigger>
          <SelectContent>
            {ultimosMeses.map(({ ano, mes }) => (
              <SelectItem key={`${ano}-${mes}`} value={`${ano}-${mes}`}>{nomeMes(mes)}, {ano}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => navigate("/equipamentos", { state: { novaEntrada: true } })}>
          <Plus className="h-4 w-4 mr-1" />Nova entrada
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
        {/* Movimento da bancada: entraram, entregues e reprovados por mês do ano escolhido. */}
        <Card className="rounded-2xl">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
            <CardTitle className="text-lg">Movimento da bancada</CardTitle>
            <span className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" />Entraram</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-ok" />Entregues</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-status-bad" />Reprovados</span>
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="flex flex-wrap gap-6">
              {resumoMovimento.map((item) => (
                <div key={item.rotulo}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.rotulo} em {nomeMes(mesSel.mes).toLowerCase()}</dt>
                  <dd className="flex items-baseline gap-2">
                    <span className={`text-2xl font-extrabold tabular-nums ${item.cor}`}>{item.valor}</span>
                    {item.variacao != null && (
                      <span className="rounded-full bg-secondary px-1.5 text-xs font-semibold tabular-nums text-muted-foreground">
                        {item.variacao > 0 ? "+" : ""}{item.variacao}%
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={movimento} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="rotulo"
                    tickLine={false}
                    axisLine={false}
                    tick={({ x, y, payload }: { x: number; y: number; payload: { value: string; index: number } }) => (
                      <text x={x} y={y + 12} textAnchor="middle" fontSize={12}
                        fontWeight={payload.index === mesSel.mes - 1 ? 700 : 400}
                        fill={payload.index === mesSel.mes - 1 ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}>
                        {payload.value}
                      </text>
                    )}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted))" }}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, color: "hsl(var(--foreground))" }}
                  />
                  <Bar dataKey="reprovados" name="Reprovados" stackId="m" fill="hsl(var(--st-bad))" maxBarSize={36} />
                  <Bar dataKey="entregues" name="Entregues" stackId="m" fill="hsl(var(--st-ok))" maxBarSize={36} />
                  <Bar dataKey="entraram" name="Entraram" stackId="m" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

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

      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Fila por etapa: arco com a parte de cada etapa e o total no meio. */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-2"><CardTitle className="text-lg">Fila por etapa</CardTitle></CardHeader>
          <CardContent>
            <div className="relative mx-auto h-36 w-full max-w-xs" role="img" aria-label={`Na fila: ${naFila}. ${filaPorEtapa.map((e) => `${e.nome} ${e.valor}`).join(", ")}`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={naFila > 0 ? filaPorEtapa : [{ nome: "vazio", valor: 1, cor: "hsl(var(--track))" }]}
                    dataKey="valor"
                    nameKey="nome"
                    cx="50%"
                    cy="100%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius="125%"
                    outerRadius="180%"
                    paddingAngle={naFila > 0 ? 2 : 0}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {(naFila > 0 ? filaPorEtapa : [{ nome: "vazio", cor: "hsl(var(--track))" }]).map((etapa) => (
                      <Cell key={etapa.nome} fill={etapa.cor} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-x-0 bottom-0 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Na fila</p>
                <p className="text-3xl font-extrabold tabular-nums">{naFila}</p>
              </div>
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {filaPorEtapa.map((etapa) => (
                <li key={etapa.nome} className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: etapa.cor }} />
                    {etapa.nome}
                  </span>
                  <span className="font-semibold tabular-nums">{etapa.valor}</span>
                </li>
              ))}
            </ul>
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

      </div>
    </div>
  );
}

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function nomeMes(mes: number) {
  return NOMES_MES[mes - 1] ?? "";
}

/** Cor de cada etapa no arco da fila (família de status de cada uma). */
const COR_ETAPA = [
  "hsl(var(--st-neutral))",
  "hsl(var(--chart-2))",
  "hsl(var(--st-wait))",
  "hsl(var(--st-work))",
  "hsl(var(--st-ok))",
];
