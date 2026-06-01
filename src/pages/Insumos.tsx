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
import { useState } from "react";
import {
  Package,
  Plus,
  Search,
  Edit,
  Trash2,
  ArrowUpCircle,
  Filter,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { SENSITIVE_PERMISSIONS, type Produto } from "@/types";
import { ActionPriorityRow } from "@/components/ui/action-priority-row";
import { CATEGORIA_OPTIONS } from "@/pages/insumos/insumos-page-constants";
import {
  InsumosDeleteDialog,
  InsumosMovimentacaoDialog,
  InsumosProdutoDialog,
} from "@/pages/insumos/InsumosDialogs";

export default function Insumos() {
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("TODOS");
  const [apenasEstoqueBaixo, setApenasEstoqueBaixo] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movDialogOpen, setMovDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [movimentando, setMovimentando] = useState<Produto | null>(null);
  const [deletando, setDeletando] = useState<Produto | null>(null);
  const [salvando, setSalvando] = useState(false);

  const {
    produtos,
    loading,
    error,
    insumosAbaixoMinimo,
    criar,
    atualizar,
    deletar,
    registrarMovimentacao,
    recarregar,
  } = useInsumos({
    busca: busca || undefined,
    categoria: categoriaFiltro,
    apenasEstoqueBaixo,
  });
  const { error: showError } = useNotification();
  const { ensureSensitiveAccess } = useSensitiveAccess();

  const form = useForm<ProdutoFormData>({
    resolver: zodResolver(produtoSchema),
    defaultValues: {
      nome: "",
      codigo: "",
      descricao: "",
      categoria: "",
      quantidade_estoque: 0,
      quantidade_minima: 5,
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
      title: "Cadastrar insumo",
      description: "Informe o PIN para alterar estoque, custos e preços dos insumos.",
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
      quantidade_minima: 5,
      preco_custo: 0,
      preco_venda: 0,
      localizacao: "",
    });
    setDialogOpen(true);
  }

  async function abrirEditar(p: Produto) {
    const liberado = await ensureSensitiveAccess({
      title: "Editar insumo",
      description: "Informe o PIN para alterar preços e parâmetros de estoque deste insumo.",
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

  async function abrirMovimentacao(p: Produto) {
    const liberado = await ensureSensitiveAccess({
      title: "Movimentar estoque",
      description: "Informe o PIN para registrar entradas e saídas de estoque.",
      permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL,
    });
    if (!liberado) return;

    setMovimentando(p);
    movForm.reset({ tipo: "ENTRADA", quantidade: 1, origem: "", referencia: "" });
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
          throw new Error(resultado.erro || "Não foi possível salvar o insumo.");
        }
      } else {
        const resultado = await criar(payload);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível criar o insumo.");
        }
      }
      setDialogOpen(false);
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      showError("Insumos", "Salvar produto", err);
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
      setMovDialogOpen(false);
    } catch (err: any) {
      console.error("Erro movimentação:", err);
      showError("Insumos", "Registrar movimentação", err);
    } finally {
      setSalvando(false);
    }
  }

  async function onDelete() {
    if (!deletando) return;
    setSalvando(true);
    try {
      await deletar(deletando.id!);
      setDeleteDialogOpen(false);
      setDeletando(null);
    } catch (err) {
      console.error("Erro ao deletar:", err);
    } finally {
      setSalvando(false);
    }
  }

  async function solicitarExclusao(produto: Produto) {
    const liberado = await ensureSensitiveAccess({
      title: "Excluir insumo",
      description: "Informe o PIN para excluir um insumo do estoque.",
      permission: SENSITIVE_PERMISSIONS.DELETE_RECORDS,
    });
    if (!liberado) return;

    setDeletando(produto);
    setDeleteDialogOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Insumos & Estoque</h1>
          <p className="text-muted-foreground">
            Controle de suprimentos e movimentação de estoque
          </p>
        </div>
        <div className="flex gap-2">
          {insumosAbaixoMinimo > 0 && (
            <Badge variant="destructive" className="h-8 px-3 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {insumosAbaixoMinimo} abaixo do mínimo
            </Badge>
          )}
          <Button onClick={() => void abrirNovo()}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Insumo
          </Button>
        </div>
      </div>

      {error && (
        <ErrorAlert
          variant="error"
          context="Insumos"
          message={error}
          action="Carregar"
        />
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, código, marca..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIA_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={apenasEstoqueBaixo ? "destructive" : "outline"}
              onClick={() => setApenasEstoqueBaixo(!apenasEstoqueBaixo)}
              size="sm"
              className="h-10"
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Estoque Baixo
            </Button>
            <Button variant="outline" size="icon" onClick={recarregar}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : produtos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-1">Nenhum insumo encontrado</p>
              <p className="text-sm">
                {busca || categoriaFiltro !== "TODOS" || apenasEstoqueBaixo
                  ? "Tente ajustar os filtros"
                  : "Clique em 'Novo Insumo' para cadastrar"}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-center">Estoque</TableHead>
                    <TableHead className="text-center">Mínimo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {produtos.map((p) => {
                    const estoqueBaixo = p.quantidade_estoque < p.quantidade_minima;
                    return (
                      <TableRow
                        key={p.id}
                        className={estoqueBaixo ? "bg-red-50/50" : ""}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{p.nome}</span>
                            {estoqueBaixo && (
                              <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {p.codigo || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.categoria}</Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {p.descricao || "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <span
                            className={`font-bold ${
                              estoqueBaixo ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            {p.quantidade_estoque}
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            un.
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {p.quantidade_minima}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <ActionPriorityRow
                              primary={{
                                id: `movimentar-${p.id}`,
                                label: "Movimentar",
                                icon: <ArrowUpCircle className="h-4 w-4" />,
                                variant: "default",
                                onClick: () => void abrirMovimentacao(p),
                              }}
                              secondary={{
                                id: `editar-${p.id}`,
                                label: "Editar",
                                icon: <Edit className="h-4 w-4" />,
                                variant: "outline",
                                onClick: () => void abrirEditar(p),
                              }}
                              overflow={[
                                {
                                  id: `excluir-${p.id}`,
                                  label: "Excluir",
                                  icon: <Trash2 className="h-4 w-4" />,
                                  className: "text-red-600",
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
      <InsumosMovimentacaoDialog
        open={movDialogOpen}
        onOpenChange={setMovDialogOpen}
        movimentando={movimentando}
        movForm={movForm}
        salvando={salvando}
        onMovSubmit={onMovSubmit}
      />
      <InsumosDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        deletando={deletando}
        salvando={salvando}
        onDelete={onDelete}
      />
    </div>
  );
}
