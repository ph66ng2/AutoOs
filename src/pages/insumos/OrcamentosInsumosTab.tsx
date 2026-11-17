/**
 * Aba "Orçamentos" de Insumos/Peças: lista compacta dos orçamentos de venda avulsa (OI-<n>)
 * com busca e filtro de status. O formulário abre em diálogo (OrcamentoInsumosDialog).
 */
import { useEffect, useState } from "react";
import { FilePlus2, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrcamentosInsumos } from "@/hooks/useOrcamentosInsumos";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { parseTimestampPostgres } from "@/lib/date-utils";
import {
  orcamentoInsumosVencido,
  STATUS_ORCAMENTO_INSUMOS_COR,
  STATUS_ORCAMENTO_INSUMOS_LABEL,
} from "@/lib/orcamento-insumos";
import { totalPages } from "@/lib/pagination";
import { formatCurrency } from "@/lib/utils";
import { OrcamentoInsumosDialog } from "@/pages/insumos/OrcamentoInsumosDialog";
import {
  SENSITIVE_PERMISSIONS,
  STATUS_ORCAMENTO_INSUMOS,
  type StatusOrcamentoInsumos,
} from "@/types";

interface OrcamentosInsumosTabProps {
  /** Chamado quando uma ação do orçamento (aprovar, cancelar, entregar, salvar) pode ter mudado o saldo do estoque. */
  onEstoqueAlterado?: () => void;
  /** Quantos orçamentos há em cada situação, para os filtros. Sem ele, os filtros aparecem sem número. */
  contagemPorStatus?: { status: StatusOrcamentoInsumos; total: number }[];
}

/** O que a pessoa faz a seguir com o orçamento; o botão abre o orçamento, onde a ação está. */
function proximaAcao(status: StatusOrcamentoInsumos, vencido: boolean): { rotulo: string; destaque: boolean } {
  if (status === "RASCUNHO") return { rotulo: "Enviar", destaque: true };
  if (status === "ENVIADO") return vencido ? { rotulo: "Reenviar", destaque: true } : { rotulo: "Abrir", destaque: true };
  if (status === "APROVADO") return { rotulo: "Entregar", destaque: true };
  return { rotulo: "Ver", destaque: false };
}

function diaMes(data: string): string {
  const partes = data.match(/^\d{4}-(\d{2})-(\d{2})/);
  return partes ? `${partes[2]}/${partes[1]}` : data;
}

export function OrcamentosInsumosTab({ onEstoqueAlterado, contagemPorStatus }: OrcamentosInsumosTabProps = {}) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusOrcamentoInsumos | "TODOS">("TODOS");
  const [pagina, setPagina] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [orcamentoId, setOrcamentoId] = useState<number | null>(null);
  const { ensureSensitiveAccess } = useSensitiveAccess();

  const { orcamentos, total, loading, error, recarregar } = useOrcamentosInsumos({
    busca: busca.trim() || undefined,
    status,
    page: pagina,
  });
  const paginas = totalPages(total);

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
    setDialogAberto(true);
  }

  function abrir(id: number) {
    setOrcamentoId(id);
    setDialogAberto(true);
  }

  return (
    <div className="space-y-3">
      <Card className="rounded-2xl">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Venda de etiquetas, ribbons e peças sem equipamento em manutenção. O estoque só baixa quando o
              orçamento é aprovado; cancelar um aprovado devolve os itens.
            </p>
            <Button className="shrink-0" onClick={() => void abrirNovo()}>
              <FilePlus2 className="mr-2 h-4 w-4" />
              Novo orçamento
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-2">
              {(["TODOS", ...STATUS_ORCAMENTO_INSUMOS] as const).map((item) => {
                const ativo = status === item;
                const contagem = item === "TODOS"
                  ? contagemPorStatus?.reduce((soma, c) => soma + c.total, 0)
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
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar orçamento"
                  placeholder="Número (OI-12), cliente ou CPF/CNPJ"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  className="h-9 pl-9"
                />
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => void recarregar()} aria-label="Recarregar orçamentos">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {error && <ErrorAlert variant="error" context="Orçamentos de insumos" message={error} action="Carregar" />}

          {loading ? (
            <div className="flex h-24 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
            </div>
          ) : orcamentos.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-base font-medium">Nenhum orçamento de insumos encontrado</p>
              <p className="text-sm">
                {busca || status !== "TODOS" ? "Tente ajustar os filtros." : "Clique em \"Novo orçamento\" para começar."}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="w-28">Número</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Itens</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Próxima ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orcamentos.map((orcamento) => {
                      const vencido = orcamentoInsumosVencido(orcamento);
                      const acao = proximaAcao(orcamento.status, vencido);
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
                            {orcamento.contato_nome && <p className="text-xs text-muted-foreground">{orcamento.contato_nome}</p>}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <span>{orcamento.total_itens} {orcamento.total_itens === 1 ? "item" : "itens"}</span>
                            {orcamento.categorias_itens && <span> · {orcamento.categorias_itens}</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_ORCAMENTO_INSUMOS_COR[orcamento.status]}>
                              {STATUS_ORCAMENTO_INSUMOS_LABEL[orcamento.status]}
                            </Badge>
                            {vencido && (
                              <Badge variant="outline" className="ml-1 border-destructive/30 bg-status-bad-bg text-destructive">
                                Vencido
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className={`text-sm tabular-nums ${vencido ? "font-semibold text-status-bad" : "text-muted-foreground"}`}>
                            {orcamento.validade && (orcamento.status === "RASCUNHO" || orcamento.status === "ENVIADO" || orcamento.status === "APROVADO")
                              ? `${vencido ? "venceu" : "até"} ${diaMes(orcamento.validade)}`
                              : "—"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                            {formatCurrency(orcamento.valor_total)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              className={acao.destaque ? "h-9 bg-acc-soft font-semibold text-acc-soft-foreground hover:bg-acc-soft/70 hover:text-acc-soft-foreground" : "h-9 text-muted-foreground"}
                              aria-label={`${acao.rotulo} orçamento ${orcamento.numero_exibicao}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                abrir(orcamento.id);
                              }}
                            >
                              {acao.rotulo}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <PaginationControls
                page={Math.min(pagina, paginas)}
                totalPages={paginas}
                onPageChange={setPagina}
                label="Paginação de orçamentos de insumos"
                totalItems={total}
                className="pb-0"
              />
            </>
          )}
        </CardContent>
      </Card>

      <OrcamentoInsumosDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        orcamentoId={orcamentoId}
        onChanged={() => {
          void recarregar();
          onEstoqueAlterado?.();
        }}
      />
    </div>
  );
}
