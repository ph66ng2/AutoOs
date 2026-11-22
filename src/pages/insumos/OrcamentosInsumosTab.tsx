/**
 * Lista da página Vendas de insumos (/vendas): lista dos orçamentos de venda avulsa (OI-<n>)
 * com busca e filtro de status. Editar é página; cada ação abre o seu modal (AcaoVendaDialog).
 */
import { useEffect, useState, type ReactNode } from "react";
import { classeDestaque } from "@/lib/ao-vivo";
import { cn } from "@/lib/utils";
import { useEstadoLembrado, usePrimeiraPaginaAoFiltrar } from "@/hooks/useEstadoLembrado";
import { Lock, Package, Plus, Search } from "lucide-react";
import { TracosDeEtapas } from "@/components/equipamentos/BarraDeEtapas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActionPriorityRow } from "@/components/ui/action-priority-row";
import { FiltroDeStatus, PilulaFiltro, type OpcaoFiltroStatus } from "@/components/equipamentos/FiltroDeStatus";
import { menuVenda } from "@/components/vendas/menu-venda";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrcamentosInsumos } from "@/hooks/useOrcamentosInsumos";
import { useLarguraMinima } from "@/hooks/useLarguraMinima";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { parseTimestampPostgres } from "@/lib/date-utils";
import {
  etapaVenda,
  familiaVenda,
  orcamentoInsumosVencido,
  prazoOuData,
  proximaAcaoVenda,
  STATUS_ORCAMENTO_INSUMOS_LABEL,
  TOTAL_ETAPAS_VENDA,
} from "@/lib/orcamento-insumos";
import { totalPages } from "@/lib/pagination";
import { formatCurrency } from "@/lib/utils";
import { AcaoVendaDialog } from "@/components/vendas/AcaoVendaDialog";
import type { AcaoInicialOrcamentoInsumos } from "@/lib/orcamento-insumos";
import {
  SENSITIVE_PERMISSIONS,
  type StatusOrcamentoInsumos,
} from "@/types";

interface OrcamentosInsumosTabProps {
  /** Chamado quando uma ação do orçamento (aprovar, cancelar, entregar, salvar) pode ter mudado o saldo do estoque. */
  onEstoqueAlterado?: () => void;
  /** Quantos orçamentos há em cada situação, para os filtros. Sem ele, os filtros aparecem sem número. */
  contagemPorStatus?: { status: StatusOrcamentoInsumos; total: number }[];
  /** Desenha o cabeçalho da página com o botão "+ Novo orçamento" (null sem a permissão). */
  renderCabecalho?: (botaoNovo: ReactNode | null) => ReactNode;
}

const COLUNAS = 7;

function opcaoFiltro(status: StatusOrcamentoInsumos): OpcaoFiltroStatus {
  return { value: status, label: STATUS_ORCAMENTO_INSUMOS_LABEL[status] };
}

/** Todas as situações em pílulas, cada uma com o seu número (canvas de Vendas). */
const FILTRO_PRINCIPAIS: OpcaoFiltroStatus[] = [
  { value: "TODOS", label: "Todos" },
  ...(["RASCUNHO", "ENVIADO", "APROVADO", "ENTREGUE", "REPROVADO", "CANCELADO"] as const).map(opcaoFiltro),
];

/** Situação no mesmo desenho da lista de equipamentos: nome e barra de etapas, sem selo. */
/** A ação principal da lista vira a ação do modal (V.5); "Ver" abre a página. */
function acaoDaLista(tipo: string): AcaoInicialOrcamentoInsumos | null {
  if (tipo === "enviar") return "email";
  if (tipo === "aprovar" || tipo === "renovar" || tipo === "entregar") return tipo;
  return null;
}

function SituacaoComEtapas({ status, vencido }: { status: StatusOrcamentoInsumos; vencido: boolean }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="block truncate text-sm font-medium">
        {STATUS_ORCAMENTO_INSUMOS_LABEL[status]}
        {vencido && <> · <span className="font-semibold text-status-bad">Vencido</span></>}
      </span>
      <TracosDeEtapas feitas={etapaVenda(status)} total={TOTAL_ETAPAS_VENDA} familia={familiaVenda(status, vencido)} />
    </div>
  );
}

export function OrcamentosInsumosTab({ onEstoqueAlterado, contagemPorStatus, renderCabecalho }: OrcamentosInsumosTabProps = {}) {
  const [busca, setBusca] = useEstadoLembrado("vendas:busca", "");
  const [status, setStatus] = useEstadoLembrado<StatusOrcamentoInsumos | "TODOS">("vendas:status", "TODOS");
  const [pagina, setPagina] = useEstadoLembrado("vendas:pagina", 1);
  const [orcamentoId, setOrcamentoId] = useState<number | null>(null);
  const [acaoInicial, setAcaoInicial] = useState<AcaoInicialOrcamentoInsumos | null>(null);
  const { ensureSensitiveAccess, hasPermission, status: sessao } = useSensitiveAccess();
  const perfilId = sessao?.unlocked ? sessao.active_profile_id ?? null : null;
  // "Minhas" fica lembrada como a busca e a situação.
  const [minhasEscolha, setMinhasEscolha] = useEstadoLembrado<"sim" | "nao">("vendas:minhas", "nao");
  const soMinhas = minhasEscolha === "sim";
  const navigate = useNavigate();
  const podeAgir = hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS);
  // Abaixo de md (768px) a tabela vira cartões (V.6).
  const telaLarga = useLarguraMinima(768);

  const minhasLigado = soMinhas && perfilId != null;
  const { orcamentos, total, contagens, minhasTotal, loading, error, recarregar, destaques: destaquesAoVivo } = useOrcamentosInsumos({
    busca: busca.trim() || undefined,
    status,
    page: pagina,
    criadoPor: minhasLigado ? perfilId : null,
    perfilId,
  });
  const paginas = totalPages(total);
  const totalGeral = contagemPorStatus?.reduce((soma, c) => soma + c.total, 0);
  const filtrando = Boolean(busca.trim()) || status !== "TODOS" || minhasLigado;

  usePrimeiraPaginaAoFiltrar([busca, status, minhasLigado], () => setPagina(1));
  useEffect(() => {
    if (loading) return;
    setPagina((atual) => Math.min(atual, paginas));
  }, [paginas, loading, setPagina]);

  async function abrirNovo() {
    const liberado = await ensureSensitiveAccess({
      title: "Novo orçamento de insumos",
      description: "Informe o PIN para criar um orçamento de venda de insumos.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) return;
    navigate("/vendas/novo");
  }

  function abrir(id: number, acao: AcaoInicialOrcamentoInsumos | null = null) {
    // Editar e renovar a validade são o formulário em página (V.4).
    if (acao === "editar" || acao === "renovar") {
      navigate(`/vendas/${id}/editar${acao === "renovar" ? "?foco=validade" : ""}`);
      return;
    }
    if (!acao) {
      verPagina(id);
      return;
    }
    setOrcamentoId(id);
    setAcaoInicial(acao);
  }

  function verPagina(id: number) {
    navigate(`/vendas/${id}`);
  }

  const botaoNovo = podeAgir ? (
    telaLarga ? (
      <Button onClick={() => void abrirNovo()} title="Novo orçamento (Alt+V)" aria-keyshortcuts="Alt+V">
        <Plus className="mr-1.5 h-4 w-4" />
        Novo orçamento
      </Button>
    ) : (
      <Button size="icon" className="h-11 w-11" aria-label="Novo orçamento" title="Novo orçamento" onClick={() => void abrirNovo()}>
        <Plus className="h-5 w-5" />
      </Button>
    )
  ) : null;

  // Com a contagem da empresa, "nenhuma venda ainda" não pisca enquanto a busca recarrega.
  const listaVazia = !error && (totalGeral !== undefined ? totalGeral === 0 : !loading && orcamentos.length === 0 && !filtrando);

  return (
    <div className="space-y-5">
      {/* Na lista vazia o botão fica só no centro, junto da explicação. */}
      {renderCabecalho ? renderCabecalho(listaVazia ? null : botaoNovo) : !listaVazia && botaoNovo && <div className="flex justify-end">{botaoNovo}</div>}

      {listaVazia ? (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center px-6 py-14 text-center">
            <span aria-hidden="true" className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-acc-soft text-acc-soft-foreground">
              <Package className="h-5 w-5" />
            </span>
            <p className="text-lg font-bold">Nenhuma venda de insumos ainda</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Orçamento de etiquetas, ribbons e peças para um cliente, sem equipamento em manutenção. O estoque só
              baixa quando o orçamento é aprovado; cancelar um aprovado devolve os itens.
            </p>
            {botaoNovo && <div className="mt-5">{botaoNovo}</div>}
          </CardContent>
        </Card>
      ) : (
      <Card className="rounded-2xl">
        <CardContent className="space-y-4 p-5">
          {!podeAgir && (
            <p className="flex items-center gap-2 rounded-xl bg-muted px-4 py-3 text-sm">
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Você pode ver os orçamentos. Para criar, enviar ou decidir, troque para um perfil com <strong>Ações financeiras</strong>.
              </span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <FiltroDeStatus
              rotulo="Filtrar por situação"
              principais={FILTRO_PRINCIPAIS}
              valor={status}
              contagens={contagens}
              onChange={(valor) => setStatus(valor as StatusOrcamentoInsumos | "TODOS")}
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar orçamento"
                placeholder="Número (OI-12), cliente ou CPF/CNPJ"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="h-11 border-transparent bg-muted pl-10"
              />
            </div>
            {/* Só aparece para quem já criou algum orçamento (ou com o filtro ligado). */}
            {perfilId != null && (minhasLigado || (minhasTotal ?? 0) > 0) && (
              <PilulaFiltro
                rotulo="Minhas"
                ligado={minhasLigado}
                numero={minhasTotal ?? undefined}
                titulo="Só os orçamentos que você criou"
                onClick={() => setMinhasEscolha(minhasLigado ? "nao" : "sim")}
              />
            )}
          </div>

          {error ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-status-bad/30 bg-status-bad-bg px-4 py-3">
              <div className="text-sm">
                <p className="font-semibold text-status-bad">Não foi possível carregar os orçamentos</p>
                <p className="text-status-bad">{error}</p>
              </div>
              <Button variant="outline" size="sm" className="h-9 bg-card" onClick={() => void recarregar()}>
                Tentar novamente
              </Button>
            </div>
          ) : !loading && orcamentos.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold">{mensagemSemResultado(status, busca.trim())}</p>
              <div className="mt-3 flex justify-center gap-2">
                {busca.trim() && (
                  <Button variant="outline" size="sm" onClick={() => setBusca("")}>
                    Limpar busca
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-primary" onClick={() => { setBusca(""); setStatus("TODOS"); }}>
                  Ver todos
                </Button>
              </div>
            </div>
          ) : (
            <>
              {telaLarga ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-24">Número</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Itens</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead>Prazo ou data</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Próxima ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody aria-busy={loading || undefined}>
                      {loading
                        ? Array.from({ length: 4 }, (_, linha) => (
                            <TableRow key={`carregando-${linha}`} className="h-14 hover:bg-transparent">
                              {Array.from({ length: COLUNAS }, (__, coluna) => (
                                <TableCell key={coluna}>
                                  <span aria-hidden="true" className={`block h-2.5 rounded-full bg-muted ${coluna === COLUNAS - 1 ? "ml-auto w-36" : coluna === 0 ? "w-10" : "w-24"}`} />
                                </TableCell>
                              ))}
                            </TableRow>
                          ))
                        : orcamentos.map((orcamento) => {
                            const vencido = orcamentoInsumosVencido(orcamento);
                            const acao = podeAgir ? proximaAcaoVenda(orcamento.status, vencido) : { rotulo: "Ver", tipo: "ver" as const };
                            const acaoNaJanela = acaoDaLista(acao.tipo);
                            return (
                              <TableRow
                                key={orcamento.id}
                                className={`h-14 cursor-pointer transition-colors duration-lenta ${classeDestaque(destaquesAoVivo?.get(orcamento.id))}`}
                                onClick={() => verPagina(orcamento.id)}
                                tabIndex={0}
                                onKeyDown={(event) => {
                                  if (event.target !== event.currentTarget) return;
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    verPagina(orcamento.id);
                                  }
                                }}
                                aria-label={`Abrir orçamento ${orcamento.numero_exibicao}`}
                              >
                                <TableCell>
                                  <p className="font-mono text-sm font-bold" title={`Criado em ${parseTimestampPostgres(orcamento.criado_em).toLocaleDateString("pt-BR")}`}>{orcamento.numero_exibicao}</p>
                                </TableCell>
                                <TableCell>
                                  <p className="font-semibold">{orcamento.cliente_nome ?? "—"}</p>
                                  <p className="text-xs text-muted-foreground">{orcamento.contato_nome || "—"}</p>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  <span>{orcamento.total_itens} {orcamento.total_itens === 1 ? "item" : "itens"}</span>
                                  {orcamento.categorias_itens && <span> · {orcamento.categorias_itens}</span>}
                                </TableCell>
                                <TableCell>
                                  <SituacaoComEtapas status={orcamento.status} vencido={vencido} />
                                </TableCell>
                                <TableCell className={`whitespace-nowrap text-sm tabular-nums ${vencido ? "font-semibold text-status-bad" : "text-muted-foreground"}`}>
                                  {prazoOuData(orcamento)}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                                  {formatCurrency(orcamento.valor_total)}
                                </TableCell>
                                <TableCell className="text-right" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                                  {podeAgir ? (
                                    <ActionPriorityRow
                                      acaoDaLinha
                                      menuTitulo={`${orcamento.numero_exibicao} · ${orcamento.cliente_nome ?? ""}`}
                                      primary={{
                                        id: `principal-${orcamento.id}`,
                                        label: acao.rotulo,
                                        onClick: () => (acaoNaJanela ? abrir(orcamento.id, acaoNaJanela) : verPagina(orcamento.id)),
                                      }}
                                      overflow={menuVenda(orcamento.id, orcamento.status, acaoNaJanela, (acaoMenu) => abrir(orcamento.id, acaoMenu))}
                                    />
                                  ) : (
                                    <Button variant="outline" size="sm" className="h-[34px] w-[176px]" aria-label={`Ver orçamento ${orcamento.numero_exibicao}`} onClick={() => verPagina(orcamento.id)}>
                                      Ver
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <ul aria-label="Orçamentos de insumos" aria-busy={loading || undefined} className="space-y-3">
                  {loading
                    ? Array.from({ length: 3 }, (_, indice) => (
                        <li key={`carregando-${indice}`} aria-hidden="true" className="space-y-3 rounded-2xl border p-4">
                          <span className="block h-2.5 w-16 rounded-full bg-muted" />
                          <span className="block h-2.5 w-40 rounded-full bg-muted" />
                          <span className="block h-11 rounded-lg bg-muted" />
                        </li>
                      ))
                    : orcamentos.map((orcamento) => {
                        const vencido = orcamentoInsumosVencido(orcamento);
                        const acao = podeAgir ? proximaAcaoVenda(orcamento.status, vencido) : { rotulo: "Ver", tipo: "ver" as const };
                        const acaoNaJanela = acaoDaLista(acao.tipo);
                        return (
                          <li key={orcamento.id} className={cn("rounded-2xl border bg-card p-4 transition-colors duration-lenta", classeDestaque(destaquesAoVivo?.get(orcamento.id)))}>
                            <button
                              type="button"
                              className="block w-full rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Abrir orçamento ${orcamento.numero_exibicao}`}
                              onClick={() => verPagina(orcamento.id)}
                            >
                              <span className="flex items-baseline justify-between gap-3">
                                <span className="font-mono text-sm font-bold">{orcamento.numero_exibicao}</span>
                                <span className="font-semibold tabular-nums">{formatCurrency(orcamento.valor_total)}</span>
                              </span>
                              <span className="mt-1 block font-semibold [overflow-wrap:anywhere]">{orcamento.cliente_nome ?? "—"}</span>
                              <span className="block text-xs text-muted-foreground">
                                {orcamento.total_itens} {orcamento.total_itens === 1 ? "item" : "itens"}
                                {orcamento.categorias_itens ? ` · ${orcamento.categorias_itens}` : ""}
                              </span>
                              <span className="mt-2 flex items-end justify-between gap-3">
                                <SituacaoComEtapas status={orcamento.status} vencido={vencido} />
                                <span className={`shrink-0 text-xs tabular-nums ${vencido ? "font-semibold text-status-bad" : "text-muted-foreground"}`}>
                                  {prazoOuData(orcamento)}
                                </span>
                              </span>
                            </button>
                            <div className="mt-3">
                              {podeAgir ? (
                                <ActionPriorityRow
                                  acaoDaLinha
                                  cheia
                                  menuTitulo={`${orcamento.numero_exibicao} · ${orcamento.cliente_nome ?? ""}`}
                                  primary={{
                                    id: `principal-${orcamento.id}`,
                                    label: acao.rotulo,
                                    onClick: () => (acaoNaJanela ? abrir(orcamento.id, acaoNaJanela) : verPagina(orcamento.id)),
                                  }}
                                  overflow={menuVenda(orcamento.id, orcamento.status, acaoNaJanela, (acaoMenu) => abrir(orcamento.id, acaoMenu))}
                                />
                              ) : (
                                <Button variant="outline" className="h-11 w-full" aria-label={`Ver orçamento ${orcamento.numero_exibicao}`} onClick={() => verPagina(orcamento.id)}>
                                  Ver
                                </Button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                </ul>
              )}
              {!loading && (
                <PaginationControls
                  page={Math.min(pagina, paginas)}
                  totalPages={paginas}
                  onPageChange={setPagina}
                  label="Paginação de orçamentos de insumos"
                  totalItems={total}
                  className="pb-0"
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
      )}

      <AcaoVendaDialog
        acao={acaoInicial}
        vendaId={orcamentoId}
        voltarPara="/vendas"
        onFechar={() => setAcaoInicial(null)}
        onAlterado={() => {
          void recarregar();
          onEstoqueAlterado?.();
        }}
      />
    </div>
  );
}

function mensagemSemResultado(status: StatusOrcamentoInsumos | "TODOS", busca: string): string {
  const situacao = status === "TODOS" ? "" : ` ${STATUS_ORCAMENTO_INSUMOS_LABEL[status].toLowerCase()}`;
  return busca ? `Nenhum orçamento${situacao} de "${busca}".` : `Nenhum orçamento${situacao}.`;
}
