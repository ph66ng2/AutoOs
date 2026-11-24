/**
 * Peças da tela Finanças (prancheta "Finanças"). Cor com sentido (decisão 26 do ALVO):
 * o que entra é azul (primary), o que sai é vermelho (st-bad), variável no mesmo vermelho mais claro.
 */
import { useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, FileText } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Tooltip as Dica, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { MesFinancas } from "@/hooks/useFinancasAno";
import {
  MES_CURTO,
  NOMES_MES,
  dinheiro,
  dinheiroComSinal,
  porcentagem,
  type CategoriaDoMes,
} from "@/lib/financas";
import { formatDatePtBr } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { GastoFixo, GastoVariavel } from "@/types";
import { CarregandoSkeleton, Skeleton } from "@/components/ui/skeleton";

export const COR_ENTRA = "hsl(var(--primary))";
export const COR_FIXO = "hsl(var(--st-bad))";
export const COR_VARIAVEL = "hsl(var(--st-bad) / 0.45)";

/** Cartão de número do topo: rótulo, valor grande, medida e rodapé. */
export function CartaoNumero({
  rotulo,
  valor,
  medida,
  rodape,
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  medida?: ReactNode;
  rodape: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={rotulo} className={cn("flex flex-col overflow-hidden rounded-2xl border bg-card", className)}>
      <div className="flex-1 px-4 pb-4 pt-4">
        <p className="text-sm text-muted-foreground">{rotulo}</p>
        <div className="mt-1 truncate text-[28px] font-extrabold leading-tight tabular-nums">{valor}</div>
        {medida && <div className="mt-3">{medida}</div>}
      </div>
      <div className="border-t bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground">{rodape}</div>
    </section>
  );
}

/** Régua de traços: `cheios` de `total` na cor dada; `marca` (posição 0 a 1) vira um traço escuro. */
export function MedidorTracos({ fracao, cor, marca, rotulo }: { fracao: number; cor: string; marca?: number | null; rotulo: string }) {
  const total = 32;
  const cheios = Math.round(Math.min(Math.max(fracao, 0), 1) * total);
  const posMarca = marca == null ? -1 : Math.min(total - 1, Math.round(Math.min(Math.max(marca, 0), 1) * total));
  return (
    <div role="img" aria-label={rotulo} className="flex h-7 gap-[3px]">
      {Array.from({ length: total }, (_, indice) => (
        <span
          key={indice}
          className={cn("flex-1 rounded-[2px]", indice === posMarca ? "bg-foreground" : indice >= cheios && "bg-track")}
          style={indice < cheios && indice !== posMarca ? { background: cor } : undefined}
        />
      ))}
    </div>
  );
}

/** Variáveis do mês com a comparação à média dos 12 meses anteriores (dica ao passar o mouse ou focar). */
export function CartaoVariaveis({
  valor,
  quantidade,
  media,
  maximo,
  ocultar,
}: {
  valor: number;
  quantidade: number;
  media: number | null;
  maximo: number;
  ocultar: boolean;
}) {
  const diferenca = media ? (valor - media) / media : null;
  const escala = Math.max(maximo, valor, media ?? 0) || 1;
  return (
    <TooltipProvider delayDuration={150}>
      <Dica>
        <TooltipTrigger asChild>
          <div tabIndex={0} className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <CartaoNumero
              className="h-full"
              rotulo="Gastos variáveis"
              valor={dinheiro(valor, ocultar)}
              medida={
                <MedidorTracos
                  fracao={valor / escala}
                  cor={COR_VARIAVEL}
                  marca={media == null ? null : media / escala}
                  rotulo={media == null ? "Gastos variáveis do mês" : "Gastos variáveis do mês; o traço escuro é a média dos 12 meses anteriores"}
                />
              }
              rodape={`${quantidade} ${quantidade === 1 ? "lançamento" : "lançamentos"} no mês`}
            />
          </div>
        </TooltipTrigger>
        {media != null && diferenca != null && (
          <TooltipContent side="top" className="rounded-xl px-3 py-2">
            <p className="text-xs text-muted-foreground">{diferenca >= 0 ? "Acima da média" : "Abaixo da média"} dos 12 meses</p>
            <p className="font-bold tabular-nums">
              {dinheiro(media, ocultar)}{" "}
              <span className={cn("text-xs", diferenca >= 0 ? "text-status-bad" : "text-primary")}>{porcentagem(diferenca, 1)}</span>
            </p>
          </TooltipContent>
        )}
      </Dica>
    </TooltipProvider>
  );
}

function Selo({ fracao, bom }: { fracao: number; bom: boolean }) {
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums", bom ? "bg-acc-soft text-acc-soft-foreground" : "bg-status-bad-bg text-status-bad")}>
      {porcentagem(fracao)}
    </span>
  );
}

const formatoEixo = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 3,
});

function DicaMes({ active, payload }: { active?: boolean; payload?: { payload: MesFinancas }[] }) {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  if (m.futuro) return null;
  const linhas = [
    { rotulo: "Faturado", valor: m.faturado, cor: COR_ENTRA },
    { rotulo: "Fixos", valor: m.fixo, cor: COR_FIXO },
    { rotulo: "Variáveis", valor: m.variavel, cor: COR_VARIAVEL },
  ];
  return (
    <div className="min-w-[13rem] rounded-xl border bg-card px-3 py-2 text-sm shadow-lg">
      <p className="text-xs text-muted-foreground">{NOMES_MES[m.mes - 1]}, {m.ano}</p>
      {linhas.map((linha) => (
        <p key={linha.rotulo} className="mt-1 flex items-center justify-between gap-4">
          <span className="flex items-center gap-2 text-xs"><span className="h-3 w-0.5 rounded" style={{ background: linha.cor }} />{linha.rotulo}</span>
          <span className="font-bold tabular-nums">{dinheiro(linha.valor)}</span>
        </p>
      ))}
      <p className="mt-1.5 flex justify-between gap-4 border-t pt-1.5">
        <span className="text-xs text-muted-foreground">Sobrou</span>
        <span className="font-bold tabular-nums">{dinheiroComSinal(m.faturado - m.fixo - m.variavel)}</span>
      </p>
    </div>
  );
}

/** Faturamento e gastos de janeiro a dezembro; o mês escolhido fica marcado e clicar num mês o escolhe. */
export function GraficoFaturamento({
  meses,
  anterior,
  mesEscolhido,
  loading,
  error,
  ocultar,
  onEscolherMes,
}: {
  meses: MesFinancas[];
  anterior: MesFinancas[];
  mesEscolhido: number;
  loading: boolean;
  error: string | null;
  ocultar: boolean;
  onEscolherMes: (mes: number) => void;
}) {
  // Acumulado até o mês escolhido, contra o mesmo período do ano anterior.
  const ate = (lista: MesFinancas[]) => lista.filter((m) => m.mes <= mesEscolhido && !m.futuro);
  const soma = (lista: MesFinancas[], campo: (m: MesFinancas) => number) => lista.reduce((t, m) => t + campo(m), 0);
  const faturado = soma(ate(meses), (m) => m.faturado);
  const gastos = soma(ate(meses), (m) => m.fixo + m.variavel);
  const faturadoAntes = soma(ate(anterior), (m) => m.faturado);
  const gastosAntes = soma(ate(anterior), (m) => m.fixo + m.variavel);
  const varFaturado = faturadoAntes ? (faturado - faturadoAntes) / faturadoAntes : null;
  const varGastos = gastosAntes ? (gastos - gastosAntes) / gastosAntes : null;
  const dados = meses.map((m) => ({ ...m, rotulo: MES_CURTO[m.mes - 1] }));

  return (
    <section aria-labelledby="grafico-financas-titulo" className="rounded-2xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="grafico-financas-titulo" className="text-base font-bold">Faturamento e gastos</h2>
        <p className="flex items-center gap-4 text-xs text-muted-foreground">
          {[["Faturado", COR_ENTRA], ["Fixos", COR_FIXO], ["Variáveis", COR_VARIAVEL]].map(([rotulo, cor]) => (
            <span key={rotulo} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: cor }} />{rotulo}</span>
          ))}
        </p>
      </div>
      <div className="mt-4 flex flex-wrap gap-6">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-primary"><ArrowDownLeft className="h-4 w-4" /></span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Faturado no ano (até {NOMES_MES[mesEscolhido - 1].toLowerCase()})</p>
            <p className="flex items-center gap-2 text-lg font-extrabold tabular-nums">
              {dinheiro(faturado, ocultar)}
              {varFaturado != null && !ocultar && <Selo fracao={varFaturado} bom={varFaturado >= 0} />}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-full border text-status-bad"><ArrowUpRight className="h-4 w-4" /></span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Gastos</p>
            <p className="flex items-center gap-2 text-lg font-extrabold tabular-nums">
              {dinheiro(gastos, ocultar)}
              {varGastos != null && !ocultar && <Selo fracao={varGastos} bom={varGastos <= 0} />}
            </p>
          </div>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-status-wait">{error}</p>}
      <div className="mt-4 h-64">
        {loading ? (
          <CarregandoSkeleton rotulo="Carregando gráfico" className="flex h-full items-end gap-3 px-2">
            {Array.from({ length: 12 }, (_, indice) => (
              <Skeleton key={indice} className="flex-1 rounded-b-none rounded-t" style={{ height: `${30 + ((indice * 37) % 50)}%` }} />
            ))}
          </CarregandoSkeleton>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dados}
              margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              barGap={3}
              onClick={(estado) => {
                const indice = (estado as { activeTooltipIndex?: number } | null)?.activeTooltipIndex;
                if (indice != null && !dados[indice]?.futuro) onEscolherMes(indice + 1);
              }}
            >
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="rotulo"
                tickLine={false}
                axisLine={false}
                tick={({ x, y, payload, index }) => (
                  <text x={x} y={y + 12} textAnchor="middle" fontSize={12} fontWeight={index === mesEscolhido - 1 ? 700 : 400} fill={index === mesEscolhido - 1 ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))"}>
                    {payload.value}
                  </text>
                )}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={68}
                tickFormatter={(v: number) => (ocultar ? "" : formatoEixo.format(v))}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", radius: 8 }} content={ocultar ? () => null : <DicaMes />} />
              <Bar dataKey="faturado" fill={COR_ENTRA} radius={[4, 4, 0, 0]} maxBarSize={14}>
                {dados.map((m) => <Cell key={m.mes} fillOpacity={m.mes === mesEscolhido ? 1 : 0.85} />)}
              </Bar>
              <Bar dataKey="fixo" stackId="gastos" fill={COR_FIXO} maxBarSize={14} />
              <Bar dataKey="variavel" stackId="gastos" fill={COR_VARIAVEL} radius={[4, 4, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

type Lancamento =
  | { tipo: "fixo"; id: string; nome: string; categoria: string; valor: number; detalhe: string; original: GastoFixo }
  | { tipo: "variavel"; id: string; nome: string; categoria: string; valor: number; detalhe: string; original: GastoVariavel };

/** Lançamentos do mês em duas abas (Fixos · n, Variáveis · n); tocar num item abre a edição. */
export function LancamentosDoMes({
  fixos,
  variaveis,
  ocultar,
  onEditarFixo,
  onEditarVariavel,
  onVerTodas,
}: {
  fixos: GastoFixo[];
  variaveis: GastoVariavel[];
  ocultar: boolean;
  onEditarFixo: (gasto: GastoFixo) => void;
  onEditarVariavel: (gasto: GastoVariavel) => void;
  onVerTodas: () => void;
}) {
  const [aba, setAba] = useState<"fixo" | "variavel">("fixo");
  const ativos = fixos.filter((g) => g.ativo !== false);
  const itens: Lancamento[] =
    aba === "fixo"
      ? ativos.map((g) => ({ tipo: "fixo", id: `f-${g.id}`, nome: g.nome, categoria: g.categoria, valor: g.valor, detalhe: "mensal", original: g }))
      : variaveis.map((g) => ({ tipo: "variavel", id: `v-${g.id}`, nome: g.descricao, categoria: g.categoria, valor: g.valor, detalhe: formatDatePtBr(g.data).slice(0, 5), original: g }));
  return (
    <section aria-labelledby="lancamentos-mes-titulo" className="flex flex-col rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="lancamentos-mes-titulo" className="text-base font-bold">Lançamentos do mês</h2>
        <Button variant="outline" size="sm" className="h-9" onClick={onVerTodas}>Ver todas</Button>
      </div>
      <div role="tablist" aria-label="Tipo de lançamento" className="mt-4 grid grid-cols-2 rounded-xl bg-muted p-1">
        {([["fixo", `Fixos · ${ativos.length}`], ["variavel", `Variáveis · ${variaveis.length}`]] as const).map(([valor, rotulo]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={aba === valor}
            onClick={() => setAba(valor)}
            className={cn(
              "h-10 rounded-lg text-[13px] font-semibold transition-colors duration-rapida",
              aba === valor ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>
      {itens.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{aba === "fixo" ? "Nenhum gasto fixo." : "Nenhum gasto variável neste mês."}</p>
      ) : (
        <ul className="mt-2 max-h-[19rem] divide-y overflow-y-auto">
          {itens.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-label={`Editar ${item.nome}`}
                onClick={() => (item.tipo === "fixo" ? onEditarFixo(item.original) : onEditarVariavel(item.original))}
                className="flex min-h-14 w-full items-center gap-3 rounded-lg py-2 text-left transition-colors duration-rapida hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.nome}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.categoria}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums">{dinheiro(item.valor, ocultar)}</span>
                  <span className="block text-xs text-muted-foreground">{item.detalhe}</span>
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Meio anel: fixos (vermelho cheio) e variáveis (vermelho claro), com o total no centro. */
export function ComposicaoGastos({ fixo, variavel, ocultar }: { fixo: number; variavel: number; ocultar: boolean }) {
  const total = fixo + variavel;
  const parteFixo = total > 0 ? fixo / total : 0;
  const raio = 80;
  const comprimento = Math.PI * raio;
  return (
    <section aria-labelledby="composicao-titulo" className="rounded-2xl border bg-card p-5">
      <h2 id="composicao-titulo" className="text-base font-bold">Composição dos gastos</h2>
      <div className="relative mx-auto mt-4 h-[118px] w-[220px]">
        <svg viewBox="0 0 200 110" className="h-full w-full" role="img" aria-label={`Fixos ${Math.round(parteFixo * 100)}% e variáveis ${Math.round((1 - parteFixo) * 100)}% dos gastos`}>
          <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="hsl(var(--track))" strokeWidth="22" />
          {total > 0 && (
            <>
              <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={COR_VARIAVEL} strokeWidth="22" />
              <path
                d="M 20 100 A 80 80 0 0 1 180 100"
                fill="none"
                stroke={COR_FIXO}
                strokeWidth="22"
                strokeDasharray={`${comprimento * parteFixo} ${comprimento}`}
              />
            </>
          )}
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Total</p>
          <p className="text-lg font-extrabold leading-tight tabular-nums">{dinheiro(total, ocultar)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 text-center text-sm">
        {[["Fixos", fixo, COR_FIXO], ["Variáveis", variavel, COR_VARIAVEL]].map(([rotulo, valor, cor]) => (
          <div key={rotulo as string}>
            <span aria-hidden="true" className="mx-auto mb-1 block h-2.5 w-2.5 rounded-sm" style={{ background: cor as string }} />
            <p className="text-muted-foreground">{rotulo as string}</p>
            <p className="font-bold tabular-nums">{dinheiro(valor as number, ocultar)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Gastos do mês por categoria e tipo, com barra proporcional à maior. */
export function PorCategoria({ categorias, ocultar, id }: { categorias: CategoriaDoMes[]; ocultar: boolean; id?: string }) {
  const maior = categorias[0]?.valor ?? 0;
  return (
    <section id={id} aria-labelledby="por-categoria-titulo" className="rounded-2xl border bg-card p-5">
      <h2 id="por-categoria-titulo" className="text-base font-bold">Por categoria</h2>
      {categorias.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhum gasto neste mês.</p>
      ) : (
        <ul className="mt-3 max-h-[16rem] space-y-3 overflow-y-auto pr-1">
          {categorias.map((item) => (
            <li key={`${item.tipo}-${item.categoria}`}>
              <p className="flex items-baseline justify-between gap-3 text-sm">
                <span>
                  {item.categoria} <span className="text-muted-foreground">· {item.tipo === "fixo" ? "fixo" : "variável"}</span>
                </span>
                <span className="font-semibold tabular-nums">{dinheiro(item.valor, ocultar)}</span>
              </p>
              <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-track">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${maior ? (item.valor / maior) * 100 : 0}%`, background: item.tipo === "fixo" ? COR_FIXO : COR_VARIAVEL }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Anel({ fracao, cor, rotulo }: { fracao: number; cor: string; rotulo: string }) {
  const raio = 24;
  const comprimento = 2 * Math.PI * raio;
  return (
    <svg viewBox="0 0 60 60" className="h-16 w-16 shrink-0 -rotate-90" role="img" aria-label={rotulo}>
      <circle cx="30" cy="30" r={raio} fill="none" stroke="hsl(var(--track))" strokeWidth="6" />
      <circle cx="30" cy="30" r={raio} fill="none" stroke={cor} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${comprimento * Math.min(Math.max(fracao, 0), 1)} ${comprimento}`} />
    </svg>
  );
}

/** Quanto do faturado do mês foi para gastos. */
export function PesoNoFaturamento({ gastos, faturado, ocultar, disponivel = true }: { gastos: number; faturado: number; ocultar: boolean; disponivel?: boolean }) {
  const fracao = faturado > 0 ? gastos / faturado : null;
  return (
    <section aria-labelledby="peso-titulo" className="rounded-2xl border bg-card p-5">
      <h2 id="peso-titulo" className="text-base font-bold">Peso no faturamento</h2>
      <div className="mt-4 flex items-center justify-between gap-4 border-t pt-4">
        {!disponivel ? (
          <p className="text-sm text-muted-foreground">Indisponível</p>
        ) : fracao == null ? (
          <p className="text-sm text-muted-foreground">Sem faturamento neste mês.</p>
        ) : (
          <>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold tabular-nums">
                {Math.round(fracao * 100)}% <span className="text-sm font-normal text-muted-foreground">em gastos</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {dinheiro(gastos, ocultar)} de {dinheiro(faturado, ocultar)} faturados.{" "}
                {fracao <= 1 ? `Sobram ${Math.round((1 - fracao) * 100)}%.` : "Os gastos passaram do faturado."}
              </p>
            </div>
            <Anel fracao={fracao} cor={COR_FIXO} rotulo={`${Math.round(fracao * 100)}% do faturado em gastos`} />
          </>
        )}
      </div>
    </section>
  );
}
