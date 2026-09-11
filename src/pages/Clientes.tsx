/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Clientes.tsx — Página de Gestão de Clientes (PF/PJ)       ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  CRUD completo de clientes Pessoa Física e Jurídica.        ║
 * ║  Funcionalidades:                                            ║
 * ║  - Tabela com busca por nome/CPF/CNPJ/telefone/email       ║
 * ║  - Detecção automática PF/PJ pelo documento digitado       ║
 * ║  - Expansão de linha para ver equipamentos vinculados       ║
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
import { Fragment, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { formatDatePtBr } from "@/lib/date-utils";
import {
  Users,
  Search,
  Edit,
  Trash2,
  RefreshCw,
  Phone,
  Mail,
  Printer,
  ChevronDown,
  ChevronRight,
  Plus,
  Building2,
  User,
  Eye,
  ContactRound,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "@/types";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { ErrorAlert } from "@/components/ui/error-alert";
import { nomeExibicaoCliente, documentoExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import { ClientesStatusBadge } from "@/pages/clientes/ClientesStatusBadge";
import {
  clientesDaAba,
  itensPaginacao,
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
  const [regularizando, setRegularizando] = useState(false);

  const { clientes, loading, error, criar, atualizar, deletar, recarregar } =
    useClientes({ busca: busca || undefined });
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const { error: showError, success } = useNotification();
  const totalAbas = totalAbasClientes(clientes.length);
  const abaExibida = Math.min(abaAtual, totalAbas);
  const clientesExibidos = clientesDaAba(clientes, abaExibida);
  const paginasVisiveis = itensPaginacao(totalAbas, abaExibida);

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
      showError("Clientes", "Salvar cliente", err);
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
      showError("Clientes", "Gerar prévia da regularização", cause);
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

      {/* Tabela */}
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
              {totalAbas > 1 && (
                <nav
                  className="flex justify-end pb-3"
                  aria-label="Paginação de clientes"
                >
                  <div className="flex h-8 items-center gap-1">
                    {paginasVisiveis.map((item) =>
                      typeof item === "number" ? (
                        <Button
                          key={item}
                          type="button"
                          variant={item === abaExibida ? "secondary" : "ghost"}
                          className="h-8 min-w-8 px-2 text-xs tabular-nums"
                          aria-label={
                            item === abaExibida
                              ? `Página ${item}, atual`
                              : `Ir para página ${item}`
                          }
                          aria-current={item === abaExibida ? "page" : undefined}
                          onClick={() => setAbaAtual(item)}
                        >
                          {item}
                        </Button>
                      ) : (
                        <span
                          key={item}
                          className="flex h-8 w-5 items-center justify-center text-xs text-muted-foreground"
                          aria-hidden="true"
                        >
                          ...
                        </span>
                      ),
                    )}
                  </div>
                </nav>
              )}
              <div className="rounded-md border">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Nome / Razão Social</TableHead>
                    <TableHead>CPF / CNPJ</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Cidade/UF</TableHead>
                    <TableHead className="sticky right-0 z-20 bg-background text-right shadow-[-5px_0_8px_-6px_hsl(var(--foreground))]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesExibidos.map(c => (
                    <Fragment key={c.id}>
                      <TableRow key={c.id}>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1 px-2 text-xs"
                            onClick={() => void toggleExpandir(c.id!)}
                            title={expandido === c.id ? "Ocultar equipamentos" : "Ver equipamentos"}
                          >
                            {expandido === c.id ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            Equip.
                          </Button>
                        </TableCell>
                        <TableCell>
                          {c.tipo_pessoa === "PJ" ? (
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              <Building2 className="h-3 w-3 mr-1" />PJ
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              <User className="h-3 w-3 mr-1" />PF
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div>
                            <p>{nomeExibicaoCliente(c)}</p>
                            {c.tipo_pessoa === "PJ" && c.razao_social && c.nome_fantasia && (
                              <p className="text-xs text-muted-foreground">{c.razao_social}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{documentoExibicaoCliente(c)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{c.telefone ? formatarTelefone(c.telefone) : c.telefone}</span>
                          </div>
                          {c.telefone_secundario && (
                            <p className="text-xs text-muted-foreground">{formatarTelefone(c.telefone_secundario)}</p>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.email ? (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{c.email}</span>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade || c.uf || "—"}
                        </TableCell>
                        <TableCell className="sticky right-0 z-10 bg-background text-right shadow-[-5px_0_8px_-6px_hsl(var(--foreground))]">
                          <div className="flex justify-end gap-1">
                            <ActionPriorityRow
                              primary={{
                                id: `equipamentos-${c.id}`,
                                label: "Equipamentos",
                                icon: <Eye className="h-4 w-4" />,
                                variant: "default",
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
                        </TableCell>
                      </TableRow>
                      {/* Equipamentos expandidos */}
                      {expandido === c.id && (
                        <TableRow key={`eq-${c.id}`}>
                          <TableCell colSpan={8} className="bg-accent/30 p-0">
                            <div className="px-6 py-3">
                              {carregandoEquip ? (
                                <div className="flex items-center gap-2 py-2">
                                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                                  <span className="text-sm text-muted-foreground">Carregando equipamentos...</span>
                                </div>
                              ) : equipamentosCliente.length === 0 ? (
                                <div className="flex items-center gap-2 py-2 text-muted-foreground">
                                  <Printer className="h-4 w-4 opacity-40" />
                                  <span className="text-sm">Nenhum equipamento vinculado</span>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <p className="text-xs font-medium text-muted-foreground mb-2">
                                    {equipamentosCliente.length} equipamento(s) vinculado(s)
                                  </p>
                                  {equipamentosCliente.slice(0, LIMITE_EQUIPAMENTOS_EXPANDIDOS).map(eq => (
                                    <button key={eq.id} type="button" onClick={() => navigate("/equipamentos", { state: { equipamentoId: eq.id } })} className="flex w-full items-center justify-between rounded border bg-background p-2 text-left hover:border-cyan-600 hover:bg-cyan-50">
                                      <div className="flex items-center gap-3">
                                        <Printer className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                          <p className="text-sm font-medium">{eq.marca} {eq.modelo}</p>
                                          <p className="text-xs text-muted-foreground font-mono">{eq.serial_number}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <ClientesStatusBadge status={eq.status} />
                                        <span className="text-xs text-muted-foreground">
                                          {formatDatePtBr(eq.data_entrada, "")}
                                        </span>
                                      </div>
                                    </button>
                                  ))}
                                  {equipamentosCliente.length > LIMITE_EQUIPAMENTOS_EXPANDIDOS && (
                                    <div className="flex justify-end pt-1">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs"
                                        onClick={() => abrirModalTodosEquipamentos(c)}
                                      >
                                        Mostrar mais ({equipamentosCliente.length - LIMITE_EQUIPAMENTOS_EXPANDIDOS})
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <ClientesFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
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
    </div>
  );
}
