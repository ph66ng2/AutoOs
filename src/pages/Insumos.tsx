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
  ArrowDownCircle,
  Filter,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
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
import { produtoSchema, movimentacaoSchema } from "@/lib/validations";
import { useInsumos } from "@/hooks/useInsumos";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SENSITIVE_PERMISSIONS } from "@/types";

const CATEGORIA_OPTIONS = [
  { value: "TODOS", label: "Todas as Categorias" },
  { value: "TONER", label: "Toner" },
  { value: "CARTUCHO", label: "Cartucho" },
  { value: "CILINDRO", label: "Cilindro" },
  { value: "FUSOR", label: "Fusor" },
  { value: "ROLO", label: "Rolo" },
  { value: "PEÇA", label: "Peça" },
  { value: "OUTRO", label: "Outro" },
];

export default function Insumos() {
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("TODOS");
  const [apenasEstoqueBaixo, setApenasEstoqueBaixo] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [movDialogOpen, setMovDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editando, setEditando] = useState<any>(null);
  const [movimentando, setMovimentando] = useState<any>(null);
  const [deletando, setDeletando] = useState<any>(null);
  const [salvando, setSalvando] = useState(false);

  const {
    produtos,
    loading,
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
  const { ensureSensitiveAccess } = useSensitiveAccess();

  const form = useForm({
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

  const movForm = useForm({
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

  async function abrirEditar(p: any) {
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

  async function abrirMovimentacao(p: any) {
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

  async function onSubmit(data: any) {
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
      };
      if (editando) {
        await atualizar(editando.id, payload);
      } else {
        await criar(payload);
      }
      setDialogOpen(false);
    } catch (err) {
      console.error("Erro ao salvar:", err);
    } finally {
      setSalvando(false);
    }
  }

  async function onMovSubmit(data: any) {
    if (!movimentando) return;
    setSalvando(true);
    try {
      await registrarMovimentacao(
        movimentando.id,
        data.tipo,
        Number(data.quantidade),
        data.origem,
        data.referencia || undefined
      );
      setMovDialogOpen(false);
    } catch (err) {
      console.error("Erro movimentação:", err);
    } finally {
      setSalvando(false);
    }
  }

  async function onDelete() {
    if (!deletando) return;
    setSalvando(true);
    try {
      await deletar(deletando.id);
      setDeleteDialogOpen(false);
      setDeletando(null);
    } catch (err) {
      console.error("Erro ao deletar:", err);
    } finally {
      setSalvando(false);
    }
  }

  async function solicitarExclusao(produto: any) {
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
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Entrada"
                              onClick={() => void abrirMovimentacao(p)}
                            >
                              <ArrowUpCircle className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void abrirEditar(p)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => void solicitarExclusao(p)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
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

      {/* Dialog Criar/Editar Produto */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editando ? "Editar Insumo" : "Novo Insumo"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input {...form.register("nome")} placeholder="Toner HP 26A" />
                {form.formState.errors.nome && (
                  <p className="text-xs text-red-500">
                    {form.formState.errors.nome.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Código</Label>
                <Input {...form.register("codigo")} placeholder="SKU-001" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Categoria *</Label>
                <Controller
                  control={form.control}
                  name="categoria"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIA_OPTIONS.filter((c) => c.value !== "TODOS").map(
                          (c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.categoria && (
                  <p className="text-xs text-red-500">
                    {form.formState.errors.categoria.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                {...form.register("descricao")}
                placeholder="Descrição do produto..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Qtd. Estoque *</Label>
                <Input
                  type="number"
                  {...form.register("quantidade_estoque", { valueAsNumber: true })}
                  min={0}
                />
                {form.formState.errors.quantidade_estoque && (
                  <p className="text-xs text-red-500">
                    {form.formState.errors.quantidade_estoque.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Qtd. Mínima *</Label>
                <Input
                  type="number"
                  {...form.register("quantidade_minima", { valueAsNumber: true })}
                  min={0}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preço Custo</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("preco_custo", { valueAsNumber: true })}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>Preço Venda</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("preco_venda", { valueAsNumber: true })}
                  min={0}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Localização</Label>
              <Input
                {...form.register("localizacao")}
                placeholder="Prateleira A, Gaveta 3..."
              />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Movimentação */}
      <Dialog open={movDialogOpen} onOpenChange={setMovDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Movimentação de Estoque</DialogTitle>
          </DialogHeader>
          {movimentando && (
            <div className="bg-accent/50 p-3 rounded-lg mb-2">
              <p className="font-medium">{movimentando.nome}</p>
              <p className="text-sm text-muted-foreground">
                Estoque atual:{" "}
                <span className="font-bold">{movimentando.quantidade_estoque}</span>{" "}
                un.
              </p>
            </div>
          )}
          <form onSubmit={movForm.handleSubmit(onMovSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <Controller
                  control={movForm.control}
                  name="tipo"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ENTRADA">
                          <div className="flex items-center gap-2">
                            <ArrowUpCircle className="h-4 w-4 text-green-600" />
                            Entrada
                          </div>
                        </SelectItem>
                        <SelectItem value="SAIDA">
                          <div className="flex items-center gap-2">
                            <ArrowDownCircle className="h-4 w-4 text-red-500" />
                            Saída
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Quantidade *</Label>
                <Input
                  type="number"
                  {...movForm.register("quantidade", { valueAsNumber: true })}
                  min={1}
                />
                {movForm.formState.errors.quantidade && (
                  <p className="text-xs text-red-500">
                    {movForm.formState.errors.quantidade.message}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Origem / Motivo *</Label>
              <Input
                {...movForm.register("origem")}
                placeholder="Compra, uso em manutenção..."
              />
              {movForm.formState.errors.origem && (
                <p className="text-xs text-red-500">
                  {movForm.formState.errors.origem.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Referência (NF, OS...)</Label>
              <Input
                {...movForm.register("referencia")}
                placeholder="NF-12345, OS-789..."
              />
            </div>

            {movimentando && (
              <div className="bg-muted p-3 rounded-lg text-sm">
                <p>
                  Estoque resultante:{" "}
                  <span className="font-bold">
                    {movForm.watch("tipo") === "ENTRADA"
                      ? movimentando.quantidade_estoque + (movForm.watch("quantidade") || 0)
                      : movimentando.quantidade_estoque - (movForm.watch("quantidade") || 0)}
                  </span>{" "}
                  un.
                </p>
              </div>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={salvando}>
                {salvando ? "Registrando..." : "Registrar Movimentação"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Exclusão */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Tem certeza que deseja excluir o insumo{" "}
            <strong>{deletando?.nome}</strong>?
          </p>
          <p className="text-sm text-red-500">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={salvando}
            >
              {salvando ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
