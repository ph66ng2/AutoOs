/**
 * Lista da página Vendas de insumos (/vendas): lista dos orçamentos de venda avulsa (OI-<n>)
 * com busca e filtro de status. O formulário abre em diálogo (OrcamentoInsumosDialog).
 */
import { useEffect, useState, type ReactNode } from "react";
import { FileText, Lock, Mail, MessageCircle, Package, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ActionPriorityRow, type PriorityAction } from "@/components/ui/action-priority-row";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrcamentosInsumos } from "@/hooks/useOrcamentosInsumos";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { parseTimestampPostgres } from "@/lib/date-utils";
import {
  acoesOrcamentoInsumos,
  orcamentoInsumosVencido,
  prazoOuData,
  proximaAcaoVenda,
  STATUS_ORCAMENTO_INSUMOS_COR,
  STATUS_ORCAMENTO_INSUMOS_LABEL,
  type TipoAcaoVenda,
} from "@/lib/orcamento-insumos";
import { totalPages } from "@/lib/pagination";
import { formatCurrency } from "@/lib/utils";
import { OrcamentoInsumosDialog, type AcaoInicialOrcamentoInsumos } from "@/pages/insumos/OrcamentoInsumosDialog";
import {
  SENSITIVE_PERMISSIONS,
  STATUS_ORCAMENTO_INSUMOS,
  type OrcamentoInsumos,
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

function SeloSituacao({ status, vencido }: { status: StatusOrcamentoInsumos; vencido: boolean }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_ORCAMENTO_INSUMOS_COR[status]}`}>
        <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-current" />
        {STATUS_ORCAMENTO_INSUMOS_LABEL[status]}
      </span>
      {vencido && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-status-bad/30 bg-status-bad-bg px-2.5 py-0.5 text-xs font-bold text-status-bad">
          <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-current" />
          Vencido
        </span>
      )}
    </div>
  );
}

export function OrcamentosInsumosTab({ onEstoqueAlterado, contagemPorStatus, renderCabecalho }: OrcamentosInsumosTabProps = {}) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusOrcamentoInsumos | "TODOS">("TODOS");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [orcamentoId, setOrcamentoId] = useState<number | null>(null);
  const [acaoInicial, setAcaoInicial] = useState<AcaoInicialOrcamentoInsumos | null>(null);
  const { ensureSensitiveAccess, hasPermission } = useSensitiveAccess();
  const podeAgir = hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS);

  const { orcamentos, total, loading, error, recarregar } = useOrcamentosInsumos({
    busca: busca.trim() || undefined,
    status,
    page: pagina,
  });
  const paginas = totalPages(total);
  const totalGeral = contagemPorStatus?.reduce((soma, c) => soma + c.total, 0);
  const filtrando = Boolean(busca.trim()) || status !== "TODOS";

  useEffect(() => {
    setPagina(1);
  }, [busca, status]);
  useEffect(() => {
    setPagina((atual) => Math.min(atual, paginas));
  }, [paginas]);

  async function abrirNovo() {
    const liberado = await ensureSensitiveAccess({
      title: "Novo orçamento de insumos",
      description: "Informe o PIN para criar um orçamento de venda de insumos.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) return;
    setOrcamentoId(null);
    setAcaoInicial(null);
    setDialogAberto(true);
  }

  function abrir(id: number, acao: AcaoInicialOrcamentoInsumos | null = null) {
    setOrcamentoId(id);
    setAcaoInicial(acao);
    setDialogAberto(true);
  }

  function menuDaLinha(orcamento: OrcamentoInsumos, principal: TipoAcaoVenda): PriorityAction[] {
    const acoes = acoesOrcamentoInsumos(orcamento.status);
    const id = orcamento.id;
    const itens: PriorityAction[] = [];
    if (acoes.gerarPdf) itens.push({ id: `pdf-${id}`, label: "Gerar PDF", icon: <FileText />, group: "Enviar", onClick: () => abrir(id, "pdf") });
    if (acoes.enviar) {
      itens.push({ id: `email-${id}`, label: "Enviar por e-mail", icon: <Mail />, group: "Enviar", onClick: () => abrir(id, "email") });
      itens.push({ id: `whatsapp-${id}`, label: "Enviar por WhatsApp", icon: <MessageCircle />, group: "Enviar", onClick: () => abrir(id, "whatsapp") });
    }
    if (acoes.aprovar && principal !== "aprovar" && principal !== "renovar") itens.push({ id: `aprovar-${id}`, label: "Aprovar", group: "Decidir", onClick: () => abrir(id, "aprovar") });
    if (acoes.reprovar) itens.push({ id: `reprovar-${id}`, label: "Reprovar", group: "Decidir", onClick: () => abrir(id, "reprovar") });
    if (acoes.editar) itens.push({ id: `editar-${id}`, label: "Editar", group: "Orçamento", onClick: () => abrir(id, "editar") });
    if (acoes.cancelar) itens.push({ id: `cancelar-${id}`, label: "Cancelar orçamento", className: "text-destructive", group: "Orçamento", onClick: () => abrir(id, "cancelar") });
    if (acoes.excluir) itens.push({ id: `excluir-${id}`, label: "Excluir", className: "text-destructive", group: "Orçamento", onClick: () => abrir(id, "excluir") });
    return itens;
  }

  const botaoNovo = podeAgir ? (
    <Button onClick={() => void abrirNovo()}>
      <Plus className="mr-1.5 h-4 w-4" />
      Novo orçamento
    </Button>
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

          <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
            {(["TODOS", ...STATUS_ORCAMENTO_INSUMOS] as const).map((item) => {
              const ativo = status === item;
              const contagem = item === "TODOS"
                ? totalGeral
                : contagemPorStatus ? (contagemPorStatus.find((c) => c.status === item)?.total ?? 0) : undefined;
              return (
                <button
                  key={item}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setStatus(item)}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors duration-rapida ${ativo ? "border-foreground bg-foreground text-background" : "bg-card hover:border-ctl"}`}
                >
                  {item === "TODOS" ? "Todos" : STATUS_ORCAMENTO_INSUMOS_LABEL[item]}
                  {contagem !== undefined && (
                    <span className={`rounded-full px-1.5 text-xs tabular-nums ${ativo ? "bg-background/20" : "bg-muted text-muted-foreground"}`}>{contagem}</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Buscar orçamento"
              placeholder="Número (OI-12), cliente ou CPF/CNPJ"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              className="h-11 border-transparent bg-muted pl-10"
            />
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
                          const acaoNaJanela: AcaoInicialOrcamentoInsumos | null =
                            acao.tipo === "enviar" ? "email" : acao.tipo === "aprovar" ? "aprovar" : acao.tipo === "renovar" ? "renovar" : acao.tipo === "entregar" ? "entregar" : null;
                          return (
                            <TableRow
                              key={orcamento.id}
                              className="h-14 cursor-pointer"
                              onClick={() => abrir(orcamento.id)}
                              tabIndex={0}
                              onKeyDown={(event) => {
                                if (event.target !== event.currentTarget) return;
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  abrir(orcamento.id);
                                }
                              }}
                              aria-label={`Abrir orçamento ${orcamento.numero_exibicao}`}
                            >
                              <TableCell>
                                <p className="font-mono text-sm font-bold">{orcamento.numero_exibicao}</p>
                                <p className="text-xs tabular-nums text-muted-foreground">
                                  {parseTimestampPostgres(orcamento.criado_em).toLocaleDateString("pt-BR")}
                                </p>
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
                                <SeloSituacao status={orcamento.status} vencido={vencido} />
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
                                      onClick: () => abrir(orcamento.id, acaoNaJanela),
                                    }}
                                    overflow={menuDaLinha(orcamento, acao.tipo)}
                                  />
                                ) : (
                                  <Button variant="outline" size="sm" className="h-[34px] w-[176px]" aria-label={`Ver orçamento ${orcamento.numero_exibicao}`} onClick={() => abrir(orcamento.id)}>
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

      <OrcamentoInsumosDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        orcamentoId={orcamentoId}
        acaoInicial={acaoInicial}
        onChanged={() => {
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
