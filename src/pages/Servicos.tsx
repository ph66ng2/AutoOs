import { useState } from "react";
import { Plus, Search, Edit, Trash2, RefreshCw, Wrench } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { servicoCatalogoSchema, type ServicoCatalogoFormData } from "@/lib/validations";
import { useServicos } from "@/hooks/useServicos";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { SENSITIVE_PERMISSIONS, type ServicoCatalogo } from "@/types";
import { ActionPriorityRow } from "@/components/ui/action-priority-row";

export default function Servicos() {
  const [busca, setBusca] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editando, setEditando] = useState<ServicoCatalogo | null>(null);
  const [deletando, setDeletando] = useState<ServicoCatalogo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { ensureSensitiveAccess } = useSensitiveAccess();

  const { servicos, loading, criar, atualizar, deletar, recarregar } = useServicos({
    busca: busca || undefined,
    apenasAtivos: true,
  });

  const form = useForm<ServicoCatalogoFormData>({
    resolver: zodResolver(servicoCatalogoSchema),
    defaultValues: {
      nome: "",
      descricao: "",
      preco_padrao: 0,
    },
  });

  async function abrirNovo() {
    const liberado = await ensureSensitiveAccess({
      title: "Cadastrar serviço",
      description: "Informe o PIN para cadastrar serviços padrão com preço pré-definido.",
      permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL,
    });
    if (!liberado) return;

    setEditando(null);
    form.reset({ nome: "", descricao: "", preco_padrao: 0 });
    setDialogOpen(true);
  }

  async function abrirEditar(servico: ServicoCatalogo) {
    const liberado = await ensureSensitiveAccess({
      title: "Editar serviço",
      description: "Informe o PIN para alterar nome e preço do serviço padrão.",
      permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL,
    });
    if (!liberado) return;

    setEditando(servico);
    form.reset({
      nome: servico.nome,
      descricao: servico.descricao || "",
      preco_padrao: Number(servico.preco_padrao || 0),
    });
    setDialogOpen(true);
  }

  async function onSubmit(data: ServicoCatalogoFormData) {
    setSalvando(true);
    try {
      const payload = {
        nome: data.nome,
        descricao: data.descricao || undefined,
        preco_padrao: Number(data.preco_padrao),
        atualizado_em: editando?.atualizado_em,
      };

      const resultado = editando
        ? await atualizar(editando.id!, payload)
        : await criar(payload);
      if (!resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível salvar o serviço.");
      }

      setDialogOpen(false);
    } catch (err: any) {
      console.error("Erro ao salvar serviço:", err);
      alert(err?.message || "Erro ao salvar serviço.");
    } finally {
      setSalvando(false);
    }
  }

  async function solicitarExclusao(servico: ServicoCatalogo) {
    const liberado = await ensureSensitiveAccess({
      title: "Excluir serviço",
      description: "Informe o PIN para desativar um serviço padrão do catálogo.",
      permission: SENSITIVE_PERMISSIONS.DELETE_RECORDS,
    });
    if (!liberado) return;

    setDeletando(servico);
    setDeleteDialogOpen(true);
  }

  async function onDelete() {
    if (!deletando) return;
    setSalvando(true);
    try {
      const resultado = await deletar(deletando.id!);
      if (!resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível excluir o serviço.");
      }
      setDeleteDialogOpen(false);
      setDeletando(null);
    } catch (err: any) {
      console.error("Erro ao excluir serviço:", err);
      alert(err?.message || "Erro ao excluir serviço.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Serviços</h1>
          <p className="text-muted-foreground">
            Catálogo de serviços padrão com preço para a verificação técnica
          </p>
        </div>
        <Button onClick={() => void abrirNovo()}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Serviço
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="icon" onClick={recarregar}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : servicos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Wrench className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-1">Nenhum serviço encontrado</p>
              <p className="text-sm">
                {busca ? "Tente ajustar a busca." : "Cadastre serviços para usar na verificação técnica."}
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serviço</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Preço Padrão</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {servicos.map((servico) => (
                    <TableRow key={servico.id}>
                      <TableCell className="font-medium">{servico.nome}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {servico.descricao || "—"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        R$ {Number(servico.preco_padrao || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <ActionPriorityRow
                            primary={{
                              id: `editar-${servico.id}`,
                              label: "Editar",
                              icon: <Edit className="h-4 w-4" />,
                              variant: "default",
                              onClick: () => void abrirEditar(servico),
                            }}
                            overflow={[
                              {
                                id: `excluir-${servico.id}`,
                                label: "Excluir",
                                icon: <Trash2 className="h-4 w-4" />,
                                className: "text-red-600",
                                onClick: () => void solicitarExclusao(servico),
                              },
                            ]}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do serviço *</Label>
              <Input {...form.register("nome")} placeholder="Ex.: Limpeza de cabeça térmica" />
              {form.formState.errors.nome && (
                <p className="text-xs text-red-500">{form.formState.errors.nome.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Preço padrão *</Label>
              <Input type="number" step="0.01" min={0.01} {...form.register("preco_padrao")} />
              {form.formState.errors.preco_padrao && (
                <p className="text-xs text-red-500">{form.formState.errors.preco_padrao.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea {...form.register("descricao")} rows={3} placeholder="Detalhes opcionais do serviço..." />
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button">Cancelar</Button>
              </DialogClose>
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Desativar o serviço <strong>{deletando?.nome}</strong>?
          </p>
          <p className="text-sm text-red-500">Ele deixará de aparecer na verificação técnica.</p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void onDelete()} disabled={salvando}>
              {salvando ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
