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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrcamentosInsumos } from "@/hooks/useOrcamentosInsumos";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { parseTimestampPostgres } from "@/lib/date-utils";
import { STATUS_ORCAMENTO_INSUMOS_COR, STATUS_ORCAMENTO_INSUMOS_LABEL } from "@/lib/orcamento-insumos";
import { totalPages } from "@/lib/pagination";
import { formatCurrency } from "@/lib/utils";
import { OrcamentoInsumosDialog } from "@/pages/insumos/OrcamentoInsumosDialog";
import {
  SENSITIVE_PERMISSIONS,
  STATUS_ORCAMENTO_INSUMOS,
  type StatusOrcamentoInsumos,
} from "@/types";

export function OrcamentosInsumosTab() {
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
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar orçamento"
                placeholder="Buscar por número (OI-12), cliente ou CPF/CNPJ"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(valor) => setStatus(valor as StatusOrcamentoInsumos | "TODOS")}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar por status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os status</SelectItem>
                {STATUS_ORCAMENTO_INSUMOS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {STATUS_ORCAMENTO_INSUMOS_LABEL[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void recarregar()} aria-label="Recarregar orçamentos">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={() => void abrirNovo()}>
              <FilePlus2 className="mr-2 h-4 w-4" />
              Novo orçamento
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <ErrorAlert variant="error" context="Orçamentos de insumos" message={error} action="Carregar" />}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex h-24 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
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
              <PaginationControls
                page={Math.min(pagina, paginas)}
                totalPages={paginas}
                onPageChange={setPagina}
                label="Paginação de orçamentos de insumos"
              />
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Número</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="w-28">Data</TableHead>
                      <TableHead className="w-32 text-right">Valor</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orcamentos.map((orcamento) => (
                      <TableRow
                        key={orcamento.id}
                        className="cursor-pointer"
                        onClick={() => abrir(orcamento.id)}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            abrir(orcamento.id);
                          }
                        }}
                        aria-label={`Abrir orçamento ${orcamento.numero_exibicao}`}
                      >
                        <TableCell className="py-2 font-mono text-sm font-medium">{orcamento.numero_exibicao}</TableCell>
                        <TableCell className="py-2">
                          <span className="font-medium">{orcamento.cliente_nome ?? "—"}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {orcamento.total_itens} {orcamento.total_itens === 1 ? "item" : "itens"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-sm">
                          {parseTimestampPostgres(orcamento.criado_em).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="py-2 text-right font-medium tabular-nums">
                          {formatCurrency(orcamento.valor_total)}
                        </TableCell>
                        <TableCell className="py-2">
                          <Badge variant="outline" className={STATUS_ORCAMENTO_INSUMOS_COR[orcamento.status]}>
                            {STATUS_ORCAMENTO_INSUMOS_LABEL[orcamento.status]}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <OrcamentoInsumosDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        orcamentoId={orcamentoId}
        onChanged={() => void recarregar()}
      />
    </div>
  );
}
