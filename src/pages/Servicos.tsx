import { validarPecas } from "@/lib/orcamento-estoque";
import { cn, formatCurrency } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Plus, Search, Edit, RefreshCw, Wrench, AlertTriangle } from "lucide-react";
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
import { servicoCatalogoSchema, type ServicoCatalogoFormData } from "@/lib/validations";
import { useServicos } from "@/hooks/useServicos";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { useNotification } from "@/hooks/useNotification";
import { ErrorAlert } from "@/components/ui/error-alert";
import { FormValidationError } from "@/components/ui/form-validation-error";
import { ValorDecimalInput } from "@/components/ui/valor-decimal-input";
import { SENSITIVE_PERMISSIONS, type ServicoCatalogo, type PecaVinculada, type SituacaoServico } from "@/types";
import { PecasDoServico } from "@/components/equipamentos/PecasDoServico";
import { ActionPriorityRow } from "@/components/ui/action-priority-row";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { totalPages } from "@/lib/pagination";
import { MODELOS_SERVICO } from "@/pages/servicos/servicos-modelos";
import { PageHeader } from "@/components/PageHeader";

export default function Servicos() {
  const [busca, setBusca] = useState("");
  /** O interruptor de cada cartão desativa (com confirmação) ou reativa o serviço. */
  const [mostrar, setMostrar] = useState<SituacaoServico>("ATIVOS");
  const [alternando, setAlternando] = useState<number | null>(null);
  const [paginaServicos, setPaginaServicos] = useState(1);
  const [modeloSelecionado, setModeloSelecionado] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editando, setEditando] = useState<ServicoCatalogo | null>(null);
  const [deletando, setDeletando] = useState<ServicoCatalogo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pecasSugeridas, setPecasSugeridas] = useState<PecaVinculada[]>([]);
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const { error: showError } = useNotification();

  const { servicos, total: totalServicos, loading, error, criar, atualizar, deletar, reativar, recarregar } = useServicos({
    busca: busca || undefined,
    situacao: mostrar,
    page: paginaServicos,
  });
  const totalPaginasServicos = totalPages(totalServicos);
  const paginaServicosExibida = Math.min(paginaServicos, totalPaginasServicos);
  const servicosExibidos = servicos;

  useEffect(() => {
    setPaginaServicos(1);
  }, [busca, mostrar]);

  useEffect(() => {
    setPaginaServicos((pagina) => Math.min(pagina, totalPaginasServicos));
  }, [totalPaginasServicos]);

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
    setModeloSelecionado("");
    setPecasSugeridas([]);
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
    setModeloSelecionado("");
    setPecasSugeridas(servico.pecas_sugeridas ?? []);
    form.reset({
      nome: servico.nome,
      descricao: servico.descricao || "",
      preco_padrao: Number(servico.preco_padrao || 0),
    });
    setDialogOpen(true);
  }

  function selecionarModelo(modeloId: string) {
    const modelo = MODELOS_SERVICO.find((item) => item.id === modeloId);
    if (!modelo) return;

    setModeloSelecionado(modeloId);
    setPecasSugeridas([]);
    form.reset({ nome: modelo.nome, descricao: modelo.descricao, preco_padrao: 0 });
  }

  async function onSubmit(data: ServicoCatalogoFormData) {
    setSalvando(true);
    try {
      if (!validarPecas(pecasSugeridas)) throw new Error("Informe quantidade inteira positiva e preço válido para as peças.");
      const payload = {
        nome: data.nome,
        descricao: data.descricao || undefined,
        preco_padrao: Number(data.preco_padrao),
        pecas_sugeridas: pecasSugeridas,
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
      showError("Serviços", "Salvar serviço", err);
    } finally {
      setSalvando(false);
    }
  }

  async function solicitarExclusao(servico: ServicoCatalogo) {
    const liberado = await ensureSensitiveAccess({
      title: "Desativar serviço",
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
        throw new Error(resultado.erro || "Não foi possível desativar o serviço.");
      }
      setDeleteDialogOpen(false);
      setDeletando(null);
    } catch (err: any) {
      console.error("Erro ao desativar serviço:", err);
      showError("Serviços", "Desativar serviço", err);
    } finally {
      setSalvando(false);
    }
  }

  async function reativarServico(servico: ServicoCatalogo) {
    const liberado = await ensureSensitiveAccess({
      title: "Reativar serviço",
      description: "Informe o PIN para o serviço voltar à verificação técnica.",
      permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL,
    });
    if (!liberado) return;

    setAlternando(servico.id!);
    try {
      const resultado = await reativar(servico.id!);
      if (!resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível reativar o serviço.");
      }
    } catch (err: any) {
      console.error("Erro ao reativar serviço:", err);
      showError("Serviços", "Reativar serviço", err);
    } finally {
      setAlternando(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Serviços"
        descricao={!loading && mostrar === "ATIVOS" && !busca ? `${totalServicos} ${totalServicos === 1 ? "ativo" : "ativos"}` : undefined}
      >
        <Button onClick={() => void abrirNovo()}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Serviço
        </Button>
      </PageHeader>

      {error && <ErrorAlert variant="error" context="Serviços" message={error} action="Carregar" />}

      <Card className="rounded-2xl">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar serviço"
                placeholder="Buscar serviço"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-11 border-transparent bg-muted pl-10"
              />
            </div>
            <div role="group" aria-label="Mostrar serviços" className="inline-flex rounded-xl bg-muted p-1">
              {(["ATIVOS", "INATIVOS", "TODOS"] as const).map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  aria-pressed={mostrar === opcao}
                  onClick={() => setMostrar(opcao)}
                  className={cn(
                    "inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors duration-rapida md:h-9",
                    mostrar === opcao ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opcao === "ATIVOS" ? "Ativos" : opcao === "INATIVOS" ? "Inativos" : "Todos"}
                  {mostrar === opcao && !loading && (
                    <span className="rounded-full bg-acc-soft px-1.5 text-[11px] font-bold tabular-nums text-acc-soft-foreground">{totalServicos}</span>
                  )}
                </button>
              ))}
            </div>
            <Button variant="outline" size="icon" className="h-11 w-11 md:h-9 md:w-9" aria-label="Recarregar serviços" onClick={recarregar}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <ul aria-busy="true" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, indice) => (
                <li key={indice} aria-hidden="true" className="space-y-3 rounded-2xl border p-4">
                  <span className="block h-2.5 w-40 rounded-full bg-muted" />
                  <span className="block h-2.5 w-24 rounded-full bg-muted" />
                  <span className="block h-6 w-28 rounded-full bg-muted" />
                </li>
              ))}
            </ul>
          ) : servicos.length === 0 ? (
            <div className="py-12 text-center">
              <span aria-hidden="true" className="mx-auto mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-acc-soft text-acc-soft-foreground">
                <Wrench className="h-5 w-5" />
              </span>
              <p className="font-semibold">{busca ? `Nenhum serviço com "${busca}".` : "Nenhum serviço cadastrado."}</p>
              {busca && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setBusca("")}>
                  Limpar busca
                </Button>
              )}
            </div>
          ) : (
            <>
              <ul aria-label="Serviços" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {servicosExibidos.map((servico) => {
                  const inativo = servico.ativo === false;
                  return (
                    <li key={servico.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className={cn("min-w-0", inativo && "opacity-55")}>
                          <p className="font-semibold [overflow-wrap:anywhere]">{servico.nome}</p>
                          {servico.descricao && <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{servico.descricao}</p>}
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!inativo}
                          aria-label={`Serviço ativo: ${servico.nome}`}
                          disabled={alternando === servico.id}
                          onClick={() => void (inativo ? reativarServico(servico) : solicitarExclusao(servico))}
                          className={cn(
                            "relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-rapida focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                            inativo ? "bg-track" : "bg-primary",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "inline-block h-5 w-5 rounded-full bg-card shadow-sm transition-transform duration-rapida ease-saida",
                              inativo ? "translate-x-0.5" : "translate-x-5",
                            )}
                          />
                        </button>
                      </div>
                      <div className="mt-auto flex items-end justify-between gap-3 border-t pt-3">
                        <div className={cn(inativo && "opacity-55")}>
                          <p className="text-xs text-muted-foreground">Preço base</p>
                          <p className="text-lg font-bold tabular-nums">
                            {Number(servico.preco_padrao || 0) === 0 ? "Garantia" : formatCurrency(Number(servico.preco_padrao || 0))}
                          </p>
                        </div>
                        <ActionPriorityRow
                          acaoDaLinha
                          menuTitulo={servico.nome}
                          primary={{
                            id: `editar-${servico.id}`,
                            label: "Editar",
                            icon: <Edit className="h-4 w-4" />,
                            onClick: () => void abrirEditar(servico),
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <PaginationControls
                page={paginaServicosExibida}
                totalPages={totalPaginasServicos}
                onPageChange={setPaginaServicos}
                label="Paginação de serviços"
                totalItems={totalServicos}
                className="pb-0"
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent tamanho="m">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!editando && (
              <div className="space-y-2">
                <Label>Modelo inicial</Label>
                <Select value={modeloSelecionado} onValueChange={selecionarModelo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Começar em branco ou escolher um modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELOS_SERVICO.map((modelo) => (
                      <SelectItem key={modelo.id} value={modelo.id}>
                        {modelo.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  O modelo cria um cadastro próprio para esta empresa. Preço e peças do estoque podem ser definidos e editados aqui.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Nome do serviço *</Label>
              <Input {...form.register("nome")} placeholder="Ex.: Limpeza de cabeça térmica" />
              <FormValidationError message={form.formState.errors.nome?.message} />
            </div>
            <div className="space-y-2">
              <Label>Preço padrão *</Label>
              <ValorDecimalInput
                min={0}
                value={Number(form.watch("preco_padrao")) || 0}
                onValueChange={(valor) => form.setValue("preco_padrao", valor, { shouldValidate: true, shouldDirty: true })}
              />
              <p className="text-xs text-muted-foreground">Use 0,00 para serviços em garantia.</p>
              <FormValidationError message={form.formState.errors.preco_padrao?.message} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea {...form.register("descricao")} rows={3} placeholder="Detalhes opcionais do serviço..." />
            </div>
            <PecasDoServico pecas={pecasSugeridas} onChange={setPecasSugeridas} />

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
        <DialogContent tamanho="p">
          <DialogHeader>
            <span aria-hidden="true" className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-status-bad-bg text-status-bad">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <DialogTitle>Desativar o serviço?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            "{deletando?.nome}" deixará de aparecer na verificação técnica.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void onDelete()} disabled={salvando}>
              {salvando ? "Desativando..." : "Desativar o serviço"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
