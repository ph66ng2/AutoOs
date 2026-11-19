/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Insumos.tsx — Página de Gestão de Estoque (Produtos)      ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  CRUD completo de produtos de estoque (toners, peças,      ║
 * ║  cartuchos, cilindros, etc).                                ║
 * ║  Funcionalidades:                                            ║
 * ║  - Tabela com busca e filtro por categoria                  ║
 * ║  - Filtro de estoque baixo (abaixo do mínimo)               ║
 * ║  - Dialog de criar/editar produto                           ║
 * ║  - Dialog de movimentação de estoque (entrada/saída)        ║
 * ║  - Alerta visual para produtos com estoque crítico          ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - hooks/useInsumos (CRUD + movimentação)                   ║
 * ║  - lib/validations.ts (produtoSchema, movimentacaoSchema)   ║
 * ║  - types/index.ts (Produto, MovimentacaoEstoque)            ║
 * ║                                                              ║
 * ║  USADO POR: App.tsx (rota /insumos)                         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useEstadoNavegacao } from "@/hooks/useEstadoNavegacao";
import { PilulaFiltro } from "@/components/equipamentos/FiltroDeStatus";
import { EscolherItemDialog } from "@/pages/insumos/EscolherItemDialog";
import { useEffect, useRef, useState } from "react";
import { useEstadoLembrado, usePrimeiraPaginaAoFiltrar } from "@/hooks/useEstadoLembrado";
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  produtoSchema,
  movimentacaoSchema,
  type MovimentacaoFormData,
  type ProdutoFormData,
} from "@/lib/validations";
import { useInsumos } from "@/hooks/useInsumos";
import { useNotification } from "@/hooks/useNotification";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { ErrorAlert } from "@/components/ui/error-alert";
import { SENSITIVE_PERMISSIONS, type Produto, type UsoProdutoOrcamentos } from "@/types";
import { ActionPriorityRow } from "@/components/ui/action-priority-row";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { formatCurrency } from "@/lib/utils";
import { totalPages } from "@/lib/pagination";
import { CATEGORIA_OPTIONS, categoriaProdutoLabel } from "@/pages/insumos/insumos-page-constants";
import {
  InsumosDeleteDialog,
  InsumosMovimentacaoDialog,
  InsumosProdutoDialog,
} from "@/pages/insumos/InsumosDialogs";
import { useResumoEstoque } from "@/hooks/useResumoEstoque";
import { textoUltimaMovimentacao } from "@/lib/estoque-movimentacao";

function NumeroEstoque({ titulo, valor, detalhe, alerta = false }: { titulo: string; valor: string | number; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <p className={`mt-1 text-[28px] font-extrabold leading-tight tabular-nums ${alerta ? "text-status-bad" : ""}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

export default function Insumos() {
  // Item de "Estoque baixo" do Início: a lista abre já buscando por ele.
  const estadoNavegacao = useEstadoNavegacao<{ busca?: string }>();
  const [busca, setBusca] = useEstadoLembrado("insumos:busca", estadoNavegacao?.busca ?? "");
  // Vindo do Início ou do Ctrl+K, a busca pedida vale (também com a tela já aberta).
  useEffect(() => {
    if (estadoNavegacao?.busca) setBusca(estadoNavegacao.busca);
  }, [estadoNavegacao, setBusca]);
  const [categoriaFiltro, setCategoriaFiltro] = useEstadoLembrado("insumos:categoria", "TODOS");
  const [apenasEstoqueBaixo, setApenasEstoqueBaixo] = useState(false);
  const [paginaInsumos, setPaginaInsumos] = useEstadoLembrado("insumos:pagina", 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movDialogOpen, setMovDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [movimentando, setMovimentando] = useState<Produto | null>(null);
  const [deletando, setDeletando] = useState<Produto | null>(null);
  const [usoDeletando, setUsoDeletando] = useState<UsoProdutoOrcamentos | null>(null);
  const [carregandoUso, setCarregandoUso] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const {
    produtos,
    total: totalProdutos,
    loading,
    error,
    insumosAbaixoMinimo,
    criar,
    atualizar,
    deletar,
    registrarMovimentacao,
    consultarUsoEmOrcamentos,
    buscarProduto,
    recarregar,
  } = useInsumos({
    busca: busca || undefined,
    categoria: categoriaFiltro,
    apenasEstoqueBaixo,
    page: paginaInsumos,
  });
  const totalPaginasInsumos = totalPages(totalProdutos);
  const paginaInsumosExibida = Math.min(paginaInsumos, totalPaginasInsumos);
  const produtosExibidos = produtos;

  usePrimeiraPaginaAoFiltrar([busca, categoriaFiltro, apenasEstoqueBaixo], () => setPaginaInsumos(1));

  useEffect(() => {
    setPaginaInsumos((pagina) => Math.min(pagina, totalPaginasInsumos));
  }, [totalPaginasInsumos]);
  const { error: showError } = useNotification();
  const { resumo, recarregar: recarregarResumo } = useResumoEstoque();
  const voltarDepoisDaEntrada = useRef<string | null>(null);

  // "Dar entrada no estoque" de uma venda de insumos chega como /insumos?entrada=<id>&quantidade=<n>:
  // abre a entrada do item já com a quantidade que falta (o PIN continua sendo pedido).
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search);
    const produtoId = Number(parametros.get("entrada"));
    if (!Number.isInteger(produtoId) || produtoId <= 0) return;
    const quantidade = Math.max(1, Number(parametros.get("quantidade")) || 1);
    // Só volta para a página de uma venda (nada de endereço arbitrário).
    const voltar = parametros.get("voltar");
    voltarDepoisDaEntrada.current = voltar && /^\/vendas\/\d+$/.test(voltar) ? voltar : null;
    window.history.replaceState(window.history.state, "", window.location.pathname);
    void buscarProduto(produtoId)
      .then((produto) => abrirMovimentacao(produto, "ENTRADA", quantidade))
      .catch((causa) => showError("Insumos/Peças", "Abrir entrada no estoque", causa));
    // Só na abertura da página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { ensureSensitiveAccess } = useSensitiveAccess();

  const form = useForm<ProdutoFormData>({
    resolver: zodResolver(produtoSchema),
    defaultValues: {
      nome: "",
      codigo: "",
      descricao: "",
      categoria: "",
      quantidade_estoque: 0,
      quantidade_minima: 0,
      preco_custo: 0,
      preco_venda: 0,
      localizacao: "",
    },
  });

  const movForm = useForm<MovimentacaoFormData>({
    resolver: zodResolver(movimentacaoSchema),
    defaultValues: {
      tipo: "ENTRADA" as "ENTRADA" | "SAIDA",
      quantidade: 1,
      origem: "",
      referencia: "",
    },
  });

  async function abrirNovo() {
    const liberado = await ensureSensitiveAccess({
      title: "Cadastrar insumo/peça",
      description: "Informe o PIN para alterar estoque, custos e preços dos insumos/peças.",
      permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL,
    });
    if (!liberado) return;

    setEditando(null);
    form.reset({
      nome: "",
      codigo: "",
      descricao: "",
      categoria: "",
      quantidade_estoque: 0,
      quantidade_minima: 0,
      preco_custo: 0,
      preco_venda: 0,
      localizacao: "",
    });
    setDialogOpen(true);
  }

  async function abrirEditar(p: Produto) {
    const liberado = await ensureSensitiveAccess({
      title: "Editar insumo/peça",
      description: "Informe o PIN para alterar preços e parâmetros de estoque deste insumo/peça.",
      permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL,
    });
    if (!liberado) return;

    setEditando(p);
    form.reset({
      nome: p.nome,
      codigo: p.codigo || "",
      descricao: p.descricao || "",
      categoria: p.categoria,
      quantidade_estoque: p.quantidade_estoque,
      quantidade_minima: p.quantidade_minima,
      preco_custo: p.preco_custo || 0,
      preco_venda: p.preco_venda || 0,
      localizacao: p.localizacao || "",
    });
    setDialogOpen(true);
  }

  const [escolherItemAberto, setEscolherItemAberto] = useState(false);

  async function abrirMovimentacao(p: Produto, tipo: "ENTRADA" | "SAIDA" = "ENTRADA", quantidade = 1) {
    const liberado = await ensureSensitiveAccess({
      title: "Movimentar estoque",
      description: "Informe o PIN para registrar entradas e saídas de estoque.",
      permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL,
    });
    if (!liberado) return;

    setMovimentando(p);
    movForm.reset({ tipo, quantidade, origem: "", referencia: "" });
    setMovDialogOpen(true);
  }

  async function onSubmit(data: ProdutoFormData) {
    setSalvando(true);
    try {
      const payload = {
        nome: data.nome,
        codigo: data.codigo,
        descricao: data.descricao || null,
        categoria: data.categoria,
        quantidade_estoque: Number(data.quantidade_estoque),
        quantidade_minima: Number(data.quantidade_minima),
        preco_custo: Number(data.preco_custo) || 0,
        preco_venda: Number(data.preco_venda) || 0,
        localizacao: data.localizacao || null,
        atualizado_em: editando?.atualizado_em,
      };
      if (editando) {
        const resultado = await atualizar(editando.id!, payload);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível salvar o insumo/peça.");
        }
      } else {
        const resultado = await criar(payload);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível criar o insumo/peça.");
        }
      }
      void recarregarResumo();
      setDialogOpen(false);
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      showError("Insumos/Peças", "Salvar produto", err);
    } finally {
      setSalvando(false);
    }
  }

  async function onMovSubmit(data: MovimentacaoFormData) {
    if (!movimentando) return;
    setSalvando(true);
    try {
      const resultado = await registrarMovimentacao(
        movimentando.id!,
        data.tipo,
        Number(data.quantidade),
        data.origem,
        data.referencia || undefined
      );
      if (!resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível registrar a movimentação.");
      }
      void recarregarResumo();
      setMovDialogOpen(false);
      const voltar = voltarDepoisDaEntrada.current;
      voltarDepoisDaEntrada.current = null;
      if (voltar) {
        // Insumos não usa o roteador; o popstate faz o BrowserRouter seguir a URL nova.
        window.history.pushState(window.history.state, "", voltar);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
    } catch (err: any) {
      console.error("Erro movimentação:", err);
      showError("Insumos/Peças", "Registrar movimentação", err);
    } finally {
      setSalvando(false);
    }
  }

  async function onDelete() {
    if (!deletando) return;
    setSalvando(true);
    try {
      await deletar(deletando.id!);
      void recarregarResumo();
      setDeleteDialogOpen(false);
      setDeletando(null);
      setUsoDeletando(null);
    } catch (err) {
      console.error("Erro ao deletar:", err);
    } finally {
      setSalvando(false);
    }
  }

  async function solicitarExclusao(produto: Produto) {
    const liberado = await ensureSensitiveAccess({
      title: "Excluir insumo/peça",
      description: "Informe o PIN para excluir um insumo/peça do estoque.",
      permission: SENSITIVE_PERMISSIONS.DELETE_RECORDS,
    });
    if (!liberado) return;

    setDeletando(produto);
    setUsoDeletando(null);
    setDeleteDialogOpen(true);
    if (produto.id == null) return;
    setCarregandoUso(true);
    try {
      setUsoDeletando(await consultarUsoEmOrcamentos(produto.id));
    } finally {
      setCarregandoUso(false);
    }
  }

  function fecharExclusao(aberto: boolean) {
    setDeleteDialogOpen(aberto);
    if (!aberto) {
      setUsoDeletando(null);
      setCarregandoUso(false);
    }
  }

  const contagemCategoria = (categoria: string) =>
    resumo?.porCategoria.find((item) => item.categoria === categoria)?.total ?? 0;
  const mostrarValor = resumo?.valorEstoque != null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight">Insumos e peças</h1>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, código..."
              aria-label="Buscar insumos e peças"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-10 pl-9"
            />
          </div>
          <Button variant="outline" className="shrink-0" onClick={() => setEscolherItemAberto(true)}>
            Movimentar estoque
          </Button>
          <Button className="shrink-0" onClick={() => void abrirNovo()}>
            <Plus className="mr-2 h-4 w-4" />
            Novo item
          </Button>
        </div>
      </div>

      {error && (
        <ErrorAlert
          variant="error"
          context="Insumos/Peças"
          message={error}
          action="Carregar"
        />
      )}

      <Card className="rounded-2xl">
        <CardContent className="space-y-5 p-5">
          <div className={`grid gap-3 sm:grid-cols-2 ${mostrarValor ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
            <NumeroEstoque titulo="Itens cadastrados" valor={resumo?.totalItens ?? "—"} detalhe={resumo ? `${resumo.porCategoria.length} ${resumo.porCategoria.length === 1 ? "categoria" : "categorias"}` : undefined} />
            <NumeroEstoque
              titulo="Abaixo do mínimo"
              valor={resumo?.abaixoMinimo ?? insumosAbaixoMinimo}
              alerta={(resumo?.abaixoMinimo ?? insumosAbaixoMinimo) > 0}
              detalhe={resumo ? `${resumo.aguardandoPeca} ${resumo.aguardandoPeca === 1 ? "OS esperando peça" : "OS esperando peça"}` : undefined}
            />
            {mostrarValor && (
              <NumeroEstoque titulo="Valor em estoque" valor={formatCurrency(resumo!.valorEstoque!).replace(/,00$/, "")} detalhe="pelo preço de custo" />
            )}
            <NumeroEstoque titulo="Saídas no mês" valor={resumo?.saidasMes ?? "—"} detalhe={resumo ? `${resumo.saidasMesOs} vinculadas a OS` : undefined} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Filtrar por categoria" className="flex flex-wrap gap-2">
              {CATEGORIA_OPTIONS.map((opt) => {
                const ativo = categoriaFiltro === opt.value;
                const contagem = opt.value === "TODOS" ? resumo?.totalItens : contagemCategoria(opt.value);
                return (
                  <PilulaFiltro
                    key={opt.value}
                    ligado={ativo}
                    rotulo={opt.value === "TODOS" ? "Todas" : opt.label}
                    numero={resumo ? contagem : undefined}
                    onClick={() => setCategoriaFiltro(opt.value)}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={apenasEstoqueBaixo}
                onClick={() => setApenasEstoqueBaixo(!apenasEstoqueBaixo)}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border bg-card px-3 text-sm font-medium"
              >
                <span aria-hidden="true" className={`relative h-4 w-7 rounded-full transition-colors duration-rapida ${apenasEstoqueBaixo ? "bg-primary" : "bg-track"}`}>
                  <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-card transition-transform duration-rapida ${apenasEstoqueBaixo ? "translate-x-3.5" : "translate-x-0.5"}`} />
                </span>
                Só estoque baixo
              </button>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Atualizar estoque" onClick={() => { void recarregar(); void recarregarResumo(); }}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : produtos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-1">Nenhum insumo/peça encontrado</p>
              <p className="text-sm">
                {busca || categoriaFiltro !== "TODOS" || apenasEstoqueBaixo
                  ? "Tente ajustar os filtros"
                  : "Clique em 'Novo item' para cadastrar"}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead>Item</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="min-w-[13rem]">Saldo</TableHead>
                    <TableHead className="text-right">Preço de venda</TableHead>
                    <TableHead>Última movimentação</TableHead>
                    <TableHead className="text-right">Movimentar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtosExibidos.map((p) => {
                    const estoqueBaixo = p.quantidade_estoque < p.quantidade_minima;
                    const proporcao = p.quantidade_minima > 0 ? Math.min(Math.max(p.quantidade_estoque, 0) / p.quantidade_minima, 1) : 1;
                    const ultima = textoUltimaMovimentacao(p);
                    return (
                      <TableRow key={p.id} className="h-14">
                        <TableCell>
                          <p className="font-semibold leading-snug">{p.nome}</p>
                          <p className="font-mono text-xs text-muted-foreground">{p.codigo || "—"}</p>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{categoriaProdutoLabel(p.categoria)}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className={`font-semibold tabular-nums ${estoqueBaixo ? "text-status-bad" : ""}`}>
                              {p.quantidade_estoque} un
                              {estoqueBaixo && <span className="sr-only"> (abaixo do mínimo)</span>}
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">mín. {p.quantidade_minima}</span>
                          </div>
                          <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track">
                            <div className={`h-full rounded-full ${estoqueBaixo ? "bg-status-bad" : "bg-status-ok"}`} style={{ width: `${proporcao * 100}%` }} />
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {formatCurrency(p.preco_venda)}
                        </TableCell>
                        <TableCell className="max-w-[16rem] text-sm text-muted-foreground">{ultima ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 bg-acc-soft font-semibold text-acc-soft-foreground hover:bg-acc-soft/70 hover:text-acc-soft-foreground"
                              aria-label={`Registrar entrada de ${p.nome}`}
                              onClick={() => void abrirMovimentacao(p, "ENTRADA")}
                            >
                              + Entrada
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-9 font-semibold"
                              aria-label={`Registrar saída de ${p.nome}`}
                              onClick={() => void abrirMovimentacao(p, "SAIDA")}
                            >
                              − Saída
                            </Button>
                            <ActionPriorityRow
                              acaoDaLinha
                              semPrincipal
                              menuTitulo={p.nome}
                              primary={{ id: `editar-${p.id}`, label: "Editar", onClick: () => void abrirEditar(p) }}
                              overflow={[
                                { id: `editar-menu-${p.id}`, label: "Editar", icon: <Edit className="h-4 w-4" />, onClick: () => void abrirEditar(p) },
                                {
                                  id: `excluir-${p.id}`,
                                  label: "Excluir",
                                  icon: <Trash2 className="h-4 w-4" />,
                                  className: "text-destructive",
                                  onClick: () => void solicitarExclusao(p),
                                },
                              ]}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                </Table>
              </div>
              <PaginationControls
                page={paginaInsumosExibida}
                totalPages={totalPaginasInsumos}
                onPageChange={setPaginaInsumos}
                label="Paginação de estoque"
                totalItems={totalProdutos}
                className="pb-0"
              />
            </>
          )}
        </CardContent>
      </Card>

      <InsumosProdutoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editando={editando}
        form={form}
        salvando={salvando}
        onSubmit={onSubmit}
      />
      <EscolherItemDialog
        open={escolherItemAberto}
        onOpenChange={setEscolherItemAberto}
        onEscolher={(produto) => {
          setEscolherItemAberto(false);
          void abrirMovimentacao(produto, "ENTRADA");
        }}
      />
      <InsumosMovimentacaoDialog
        open={movDialogOpen}
        onOpenChange={(aberto) => {
          setMovDialogOpen(aberto);
          // Fechou sem salvar: não volta para a venda numa movimentação futura.
          if (!aberto) voltarDepoisDaEntrada.current = null;
        }}
        movimentando={movimentando}
        movForm={movForm}
        salvando={salvando}
        onMovSubmit={onMovSubmit}
      />
      <InsumosDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={fecharExclusao}
        deletando={deletando}
        salvando={salvando}
        onDelete={onDelete}
        uso={usoDeletando}
        carregandoUso={carregandoUso}
      />
    </div>
  );
}
