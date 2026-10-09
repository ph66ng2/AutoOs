/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Clientes.tsx — Página de Gestão de Clientes (PF/PJ)       ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  CRUD completo de clientes Pessoa Física e Jurídica.        ║
 * ║  Funcionalidades:                                            ║
 * ║  - Lista com busca por nome/CPF/CNPJ/telefone/email        ║
 * ║  - Detecção automática PF/PJ pelo documento digitado       ║
 * ║  - Expansão do cliente para ver equipamentos vinculados     ║
 * ║  - Busca de CEP automática via ViaCEP                       ║
 * ║  - Dialog de criar/editar com todos os campos               ║
 * ║  - Dialog de confirmação de exclusão                         ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - hooks/useClientes (CRUD + listagem)                      ║
 * ║  - lib/db.ts (listarEquipamentos para expansão)             ║
 * ║  - lib/validations.ts (clienteSchema, formatadores)         ║
 * ║  - types/index.ts (Cliente, Equipamento, STATUS_*)          ║
 * ║                                                              ║
 * ║  USADO POR: App.tsx (rota /clientes)                        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { formatDatePtBr } from "@/lib/date-utils";
import {
  Users,
  Search,
  Edit,
  Trash2,
  RefreshCw,
  Printer,
  ChevronDown,
  ChevronRight,
  Plus,
  Building2,
  User,
  ContactRound,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  clienteSchema,
  type ClienteFormData,
  formatarDocumento,
  formatarTelefone,
  formatarCEP,
  detectarTipoDocumento,
} from "@/lib/validations";
import { useClientes } from "@/hooks/useClientes";
import { useNotification } from "@/hooks/useNotification";
import { db } from "@/lib/db";
import {
  SENSITIVE_PERMISSIONS,
  type Cliente,
  type Equipamento,
  type RegularizacaoLegadoPrevia,
  type VinculoEmpresaPerfilInput,
  type VinculoEmpresaPerfilPrevia,
} from "@/types";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { nomeExibicaoCliente, documentoExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import { ClientesStatusBadge } from "@/pages/clientes/ClientesStatusBadge";
import {
  totalAbasClientes,
} from "@/pages/clientes/clientes-pagination";
import {
  ClientesDeleteDialog,
  ClientesContatosModal,
  ClientesEquipamentosModal,
  ClientesFormDialog,
} from "@/pages/clientes/ClientesDialogs";
import { ActionPriorityRow } from "@/components/ui/action-priority-row";
import { RegularizacaoLegadosDialog } from "@/components/clientes/RegularizacaoLegadosDialog";
import { VinculoEmpresaPerfilDialog } from "@/components/clientes/VinculoEmpresaPerfilDialog";

export default function Clientes() {
  const navigate = useNavigate();
  const LIMITE_EQUIPAMENTOS_EXPANDIDOS = 5;
  const [busca, setBusca] = useState("");
  const [abaAtual, setAbaAtual] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [deletando, setDeletando] = useState<Cliente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroDocumentoDuplicado, setErroDocumentoDuplicado] = useState<string | null>(null);
  const [tipoPessoa, setTipoPessoa] = useState<"PF" | "PJ" | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Equipamentos vinculados
  const [expandido, setExpandido] = useState<number | null>(null);
  const [equipamentosCliente, setEquipamentosCliente] = useState<Equipamento[]>([]);
  const [carregandoEquip, setCarregandoEquip] = useState(false);
  const [modalEquipamentosOpen, setModalEquipamentosOpen] = useState(false);
  const [clienteEquipamentosSelecionado, setClienteEquipamentosSelecionado] = useState<Cliente | null>(null);
  const [contatosClienteSelecionado, setContatosClienteSelecionado] = useState<Cliente | null>(null);
  const [previaRegularizacao, setPreviaRegularizacao] = useState<RegularizacaoLegadoPrevia | null>(null);
  const [previaVinculoEmpresa, setPreviaVinculoEmpresa] = useState<VinculoEmpresaPerfilPrevia | null>(null);
  const [regularizando, setRegularizando] = useState(false);

  const { clientes, total: totalClientes, loading, error, criar, atualizar, deletar, recarregar } =
    useClientes({ busca: busca || undefined, page: abaAtual });
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const { error: showError, success } = useNotification();
  const totalAbas = totalAbasClientes(totalClientes);
  const abaExibida = Math.min(abaAtual, totalAbas);
  const clientesExibidos = clientes;

  useEffect(() => {
    setAbaAtual(1);
  }, [busca]);

  useEffect(() => {
    setAbaAtual((aba) => Math.min(aba, totalAbas));
  }, [totalAbas]);

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      documento: "", tipo_pessoa: "PF", nome: "",
      razao_social: "", nome_fantasia: "", inscricao_estadual: "",
      telefone: "", telefone_secundario: "",
      email: "", cep: "", endereco: "", numero: "", complemento: "",
      bairro: "", cidade: "", uf: "", observacoes: "",
    },
  });

  // Detectar tipo de documento em tempo real
  const documentoValue = form.watch("documento");
  useEffect(() => {
    setErroDocumentoDuplicado(null);
  }, [documentoValue]);

  useEffect(() => {
    if (!documentoValue) {
      setTipoPessoa(null);
      return;
    }
    const tipo = detectarTipoDocumento(documentoValue);
    if (tipo === "CPF") {
      setTipoPessoa("PF");
      form.setValue("tipo_pessoa", "PF");
    } else if (tipo === "CNPJ") {
      setTipoPessoa("PJ");
      form.setValue("tipo_pessoa", "PJ");
    } else {
      setTipoPessoa(null);
    }
  }, [documentoValue, form]);

  // Buscar CEP via ViaCEP
  const buscarCep = useCallback(async (cep: string) => {
    const numeros = cep.replace(/\D/g, "");
    if (numeros.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${numeros}/json/`);
      const data = await resp.json();
      if (!data.erro) {
        form.setValue("endereco", data.logradouro || "");
        form.setValue("bairro", data.bairro || "");
        form.setValue("cidade", data.localidade || "");
        form.setValue("uf", data.uf || "");
        form.setValue("complemento", data.complemento || "");
      }
    } catch {
      // Silenciar erros de rede
    } finally {
      setBuscandoCep(false);
    }
  }, [form]);

  /**
   * Expande/recolhe a linha do cliente para exibir equipamentos vinculados.
   * Busca equipamentos por nome do cliente via db.listarEquipamentos.
   * Conecta-se a: db.listarEquipamentos → Rust listar_equipamentos
   */
  async function toggleExpandir(clienteId: number) {
    if (expandido === clienteId) {
      setExpandido(null);
      setEquipamentosCliente([]);
      return;
    }
    setExpandido(clienteId);
    setCarregandoEquip(true);
    try {
      const cliente = clientes.find(c => c.id === clienteId);
      if (cliente) {
        const nome = nomeExibicaoCliente(cliente);
        const todos = await db.listarEquipamentos(nome);
        const doCliente = todos.filter(eq => eq.cliente_nome === nome || eq.cliente_nome === cliente.nome);
        setEquipamentosCliente(doCliente);
      }
    } catch (err) {
      console.error("Erro ao buscar equipamentos:", err);
      setEquipamentosCliente([]);
    } finally {
      setCarregandoEquip(false);
    }
  }

  function abrirModalTodosEquipamentos(cliente: Cliente) {
    setClienteEquipamentosSelecionado(cliente);
    setModalEquipamentosOpen(true);
  }

  /** Abre dialog para criar novo cliente. Reseta form e tipo de pessoa */
  function abrirNovo() {
    setEditando(null);
    setErroDocumentoDuplicado(null);
    setTipoPessoa(null);
    form.reset({
      documento: "", tipo_pessoa: "PF", nome: "",
      razao_social: "", nome_fantasia: "", inscricao_estadual: "",
      telefone: "", telefone_secundario: "",
      email: "", cep: "", endereco: "", numero: "", complemento: "",
      bairro: "", cidade: "", uf: "", observacoes: "",
    });
    setDialogOpen(true);
  }

  /** Abre dialog para editar cliente. Preenche form com dados existentes e detecta tipo PF/PJ */
  function abrirEditar(c: Cliente) {
    setErroDocumentoDuplicado(null);
    setEditando(c);
    const doc = c.documento || c.cpf_cnpj || "";
    setTipoPessoa(c.tipo_pessoa === "PJ" ? "PJ" : doc.replace(/\D/g, "").length === 14 ? "PJ" : "PF");
    form.reset({
      documento: doc ? formatarDocumento(doc) : "",
      tipo_pessoa: c.tipo_pessoa === "PJ" ? "PJ" : "PF",
      nome: c.nome || "",
      razao_social: c.razao_social || "",
      nome_fantasia: c.nome_fantasia || "",
      inscricao_estadual: c.inscricao_estadual || "",
      telefone: c.telefone ? formatarTelefone(c.telefone) : "",
      telefone_secundario: c.telefone_secundario ? formatarTelefone(c.telefone_secundario) : "",
      email: c.email || "",
      cep: c.cep ? formatarCEP(c.cep) : "",
      endereco: c.endereco || "",
      numero: c.numero || "",
      complemento: c.complemento || "",
      bairro: c.bairro || "",
      cidade: c.cidade || "",
      uf: c.uf || "",
      observacoes: c.observacoes || "",
    });
    setDialogOpen(true);
  }

  /**
   * Salva cliente (criar ou editar). Monta payload com:
   * - tipo_pessoa detectado pelo tamanho do documento
   * - documento sem máscara, telefone sem máscara
   * - Para PJ: razao_social, nome_fantasia, inscricao_estadual
   * Conecta-se a: useClientes.criar/atualizar → db → Rust
   */
  async function onSubmit(data: ClienteFormData) {
    setErroDocumentoDuplicado(null);
    setSalvando(true);
    try {
      const docNumeros = data.documento.replace(/\D/g, "");
      const isPJ = docNumeros.length === 14;
      const payload: Omit<Cliente, "id"> = {
        tipo_pessoa: isPJ ? "PJ" : "PF",
        documento: docNumeros,
        cpf_cnpj: docNumeros,
        nome: isPJ ? (data.nome_fantasia || data.razao_social || "") : (data.nome || ""),
        razao_social: isPJ ? (data.razao_social || null) : null,
        nome_fantasia: isPJ ? (data.nome_fantasia || null) : null,
        inscricao_estadual: isPJ ? (data.inscricao_estadual || null) : null,
        telefone: data.telefone?.replace(/\D/g, "") || "",
        telefone_secundario: data.telefone_secundario?.replace(/\D/g, "") || null,
        email: data.email || null,
        cep: data.cep?.replace(/\D/g, "") || null,
        endereco: data.endereco || null,
        numero: data.numero || null,
        complemento: data.complemento || null,
        bairro: data.bairro || null,
        cidade: data.cidade || null,
        uf: data.uf || null,
        receber_email: true,
        receber_whatsapp: true,
        observacoes: data.observacoes || null,
        ativo: true,
        atualizado_em: editando?.atualizado_em,
      } as any;

      if (editando) {
        const resultado = await atualizar(editando.id!, payload);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível salvar o cliente.");
        }
      } else {
        const resultado = await criar(payload);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível criar o cliente.");
        }
      }
      setDialogOpen(false);
    } catch (err: any) {
      console.error("Erro:", err);
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("cpf/cnpj já está cadastrado")) {
        setErroDocumentoDuplicado(message);
      } else {
        showError("Clientes", "Salvar cliente", err);
      }
    } finally {
      setSalvando(false);
    }
  }

  /** Confirma e executa exclusão do cliente. Conecta-se a: useClientes.deletar → db → Rust */
  async function onDelete() {
    if (!deletando) return;
    setSalvando(true);
    try {
      await deletar(deletando.id!);
      setDeleteDialogOpen(false);
      setDeletando(null);
    } catch (err) {
      console.error("Erro:", err);
    } finally {
      setSalvando(false);
    }
  }

  async function solicitarExclusao(cliente: Cliente) {
    const liberado = await ensureSensitiveAccess({
      title: "Excluir cliente",
      description: "Informe o PIN para excluir um cliente e os vínculos associados a ele.",
      permission: SENSITIVE_PERMISSIONS.DELETE_RECORDS,
    });
    if (!liberado) return;

    setDeletando(cliente);
    setDeleteDialogOpen(true);
  }

  async function abrirRegularizacaoLegados() {
    const liberado = await ensureSensitiveAccess({
      title: "Regularizar cadastros antigos",
      description: "A prévia identifica registros antigos e conflitos. Nenhum dado será alterado nesta etapa.",
      permission: SENSITIVE_PERMISSIONS.MANAGE_PROFILES,
    });
    if (!liberado) return;
    try {
      setPreviaRegularizacao(await db.previsualizarRegularizacaoLegados());
    } catch (cause) {
      if (String(cause).includes("não está vinculado a uma empresa ativa")) {
        try {
          setPreviaVinculoEmpresa(await db.previsualizarVinculoEmpresaPerfil());
          return;
        } catch (vinculoCause) {
          showError("Clientes", "Preparar vínculo da empresa interna", vinculoCause);
          return;
        }
      }
      showError("Clientes", "Gerar prévia da regularização", cause);
    }
  }

  async function vincularPerfilEmpresa(input: VinculoEmpresaPerfilInput, pin: string) {
    setRegularizando(true);
    try {
      const resultado = await db.vincularPerfilAtivoEmpresa(input, pin);
      setPreviaVinculoEmpresa(null);
      success("Clientes", `Perfil vinculado à empresa ${resultado.empresa_nome}.`, "Vínculo concluído");
      setPreviaRegularizacao(await db.previsualizarRegularizacaoLegados());
    } catch (cause) {
      showError("Clientes", "Vincular perfil à empresa interna", cause);
    } finally {
      setRegularizando(false);
    }
  }

  async function executarRegularizacaoLegados(pin: string) {
    if (!previaRegularizacao) return;
    setRegularizando(true);
    try {
      const resultado = await db.executarRegularizacaoLegados(previaRegularizacao.token, pin);
      setPreviaRegularizacao(null);
      await recarregar();
      success("Clientes", `${resultado.clientes} cliente(s) e ${resultado.equipamentos} equipamento(s) regularizados.`, "Regularização concluída");
    } catch (cause) {
      showError("Clientes", "Executar regularização", cause);
      setPreviaRegularizacao(null);
    } finally {
      setRegularizando(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Gerencie clientes PF e PJ e seus equipamentos vinculados</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void abrirRegularizacaoLegados()}>
            Regularizar antigos
          </Button>
          <Button onClick={abrirNovo}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cliente
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome, razão social, CPF/CNPJ, telefone, email..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" size="icon" onClick={recarregar}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardContent className="pt-6">
          {error && (
            <ErrorAlert variant="error" context="Clientes" message={error} action="Carregar" />
          )}
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-1">Nenhum cliente encontrado</p>
              <p className="text-sm">{busca ? "Tente ajustar a busca" : "Clique em \"Novo Cliente\" para cadastrar"}</p>
            </div>
          ) : (
            <>
              <PaginationControls
                page={abaExibida}
                totalPages={totalAbas}
                onPageChange={setAbaAtual}
                label="Paginação de clientes"
              />
              <div className="divide-y rounded-md border" role="list" aria-label="Clientes">
                {clientesExibidos.map(c => (
                  <div key={c.id} role="listitem" className="min-w-0">
                    <div className="grid min-w-0 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0 space-y-3">
                        <div className="flex min-w-0 items-start gap-3">
                          {c.tipo_pessoa === "PJ" ? (
                            <Badge variant="outline" className="shrink-0 border-purple-200 bg-purple-50 text-purple-700">
                              <Building2 className="mr-1 h-3 w-3" />PJ
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-50 text-blue-700">
                              <User className="mr-1 h-3 w-3" />PF
                            </Badge>
                          )}
                          <div className="min-w-0">
                            <p className="break-words font-medium">{nomeExibicaoCliente(c)}</p>
                            {c.tipo_pessoa === "PJ" && c.razao_social && c.nome_fantasia && (
                              <p className="break-words text-xs text-muted-foreground">{c.razao_social}</p>
                            )}
                          </div>
                        </div>
                        <dl className="grid min-w-0 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 2xl:grid-cols-4">
                          <div className="min-w-0">
                            <dt className="text-xs text-muted-foreground">CPF / CNPJ</dt>
                            <dd className="break-all font-mono">{documentoExibicaoCliente(c)}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-muted-foreground">Telefone</dt>
                            <dd className="break-all">{c.telefone ? formatarTelefone(c.telefone) : "—"}</dd>
                            {c.telefone_secundario && (
                              <dd className="break-all text-xs text-muted-foreground">{formatarTelefone(c.telefone_secundario)}</dd>
                            )}
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-muted-foreground">Email</dt>
                            <dd className="break-all">{c.email || "—"}</dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-xs text-muted-foreground">Cidade/UF</dt>
                            <dd className="break-words">{c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade || c.uf || "—"}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="flex min-w-0 items-start justify-end">
                        <ActionPriorityRow
                          wrap
                          primary={{
                            id: `equipamentos-${c.id}`,
                            label: "Equipamentos",
                            icon: expandido === c.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />,
                            variant: "default",
                            ariaExpanded: expandido === c.id,
                            onClick: () => void toggleExpandir(c.id!),
                          }}
                          secondary={{
                            id: `editar-${c.id}`,
                            label: "Editar",
                            icon: <Edit className="h-4 w-4" />,
                            variant: "outline",
                            onClick: () => abrirEditar(c),
                          }}
                          overflow={[
                            {
                              id: `contatos-${c.id}`,
                              label: "Contatos",
                              icon: <ContactRound className="h-4 w-4" />,
                              onClick: () => setContatosClienteSelecionado(c),
                            },
                            {
                              id: `excluir-${c.id}`,
                              label: "Excluir",
                              icon: <Trash2 className="h-4 w-4" />,
                              className: "text-red-600",
                              onClick: () => void solicitarExclusao(c),
                            },
                          ]}
                        />
                      </div>
                    </div>
                    {expandido === c.id && (
                      <div id={`equipamentos-cliente-${c.id}`} className="min-w-0 border-t bg-accent/30 px-4 py-3">
                        {carregandoEquip ? (
                          <div className="flex items-center gap-2 py-2">
                            <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-blue-600" />
                            <span className="text-sm text-muted-foreground">Carregando equipamentos...</span>
                          </div>
                        ) : equipamentosCliente.length === 0 ? (
                          <div className="flex items-center gap-2 py-2 text-muted-foreground">
                            <Printer className="h-4 w-4 opacity-40" />
                            <span className="text-sm">Nenhum equipamento vinculado</span>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              {equipamentosCliente.length} equipamento(s) vinculado(s)
                            </p>
                            {equipamentosCliente.slice(0, LIMITE_EQUIPAMENTOS_EXPANDIDOS).map(eq => (
                              <button
                                key={eq.id}
                                type="button"
                                onClick={() => navigate("/equipamentos", { state: { equipamentoId: eq.id } })}
                                className="grid w-full min-w-0 gap-2 rounded border bg-background p-3 text-left hover:border-cyan-600 hover:bg-cyan-50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                              >
                                <span className="flex min-w-0 items-start gap-3">
                                  <Printer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                  <span className="min-w-0">
                                    <span className="block break-words text-sm font-medium">{eq.marca} {eq.modelo}</span>
                                    <span className="block break-all font-mono text-xs text-muted-foreground">{eq.serial_number}</span>
                                  </span>
                                </span>
                                <span className="flex flex-wrap items-center gap-2 sm:justify-end">
                                  <ClientesStatusBadge status={eq.status} />
                                  <span className="text-xs text-muted-foreground">{formatDatePtBr(eq.data_entrada, "")}</span>
                                </span>
                              </button>
                            ))}
                            {equipamentosCliente.length > LIMITE_EQUIPAMENTOS_EXPANDIDOS && (
                              <div className="flex justify-end pt-1">
                                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => abrirModalTodosEquipamentos(c)}>
                                  Mostrar mais ({equipamentosCliente.length - LIMITE_EQUIPAMENTOS_EXPANDIDOS})
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ClientesFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setErroDocumentoDuplicado(null);
        }}
        erroDocumentoDuplicado={erroDocumentoDuplicado}
        onDismissDuplicate={() => setErroDocumentoDuplicado(null)}
        onBuscarClienteExistente={() => {
          const documento = form.getValues("documento").replace(/\D/g, "");
          setBusca(documento);
          setErroDocumentoDuplicado(null);
          setDialogOpen(false);
        }}
        editando={editando}
        form={form}
        tipoPessoa={tipoPessoa}
        buscarCep={buscarCep}
        buscandoCep={buscandoCep}
        salvando={salvando}
        onSubmit={onSubmit}
      />

      <ClientesDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        deletando={deletando}
        salvando={salvando}
        onDelete={onDelete}
      />

      <ClientesEquipamentosModal
        open={modalEquipamentosOpen}
        onOpenChange={setModalEquipamentosOpen}
        cliente={clienteEquipamentosSelecionado}
        equipamentos={equipamentosCliente}
      />

      <ClientesContatosModal
        open={Boolean(contatosClienteSelecionado)}
        onOpenChange={(open) => { if (!open) setContatosClienteSelecionado(null); }}
        cliente={contatosClienteSelecionado}
      />

      <RegularizacaoLegadosDialog
        open={Boolean(previaRegularizacao)}
        previa={previaRegularizacao}
        loading={regularizando}
        onOpenChange={(open) => { if (!open) setPreviaRegularizacao(null); }}
        onConfirm={executarRegularizacaoLegados}
      />

      <VinculoEmpresaPerfilDialog
        open={Boolean(previaVinculoEmpresa)}
        previa={previaVinculoEmpresa}
        loading={regularizando}
        onOpenChange={(open) => { if (!open) setPreviaVinculoEmpresa(null); }}
        onConfirm={vincularPerfilEmpresa}
      />
    </div>
  );
}
