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
import { useState, useEffect, useCallback } from "react";
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
  MapPin,
  Loader2,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
import {
  clienteSchema,
  type ClienteFormData,
  formatarDocumento,
  formatarTelefone,
  formatarCEP,
  detectarTipoDocumento,
} from "@/lib/validations";
import { useClientes } from "@/hooks/useClientes";
import { db } from "@/lib/db";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  SENSITIVE_PERMISSIONS,
  type Cliente,
  type Equipamento,
  type StatusEquipamento,
} from "@/types";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";

/** Badge colorido de status de equipamento. Reutilizado na expansão de equipamentos do cliente */
function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as StatusEquipamento] || status;
  const color = STATUS_COLORS[status as StatusEquipamento] || "bg-gray-100 text-gray-800";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

/** Retorna nome de exibição do cliente */
function nomeExibicao(c: Cliente): string {
  if (c.tipo_pessoa === "PJ") {
    return c.nome_fantasia || c.razao_social || c.nome || "—";
  }
  return c.nome || "—";
}

/** Retorna o documento formatado para exibição */
function documentoExibicao(c: Cliente): string {
  const doc = c.documento || c.cpf_cnpj;
  if (!doc) return "—";
  return formatarDocumento(doc);
}

export default function Clientes() {
  const [busca, setBusca] = useState("");
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

  const { clientes, loading, criar, atualizar, deletar, recarregar } =
    useClientes({ busca: busca || undefined });
  const { ensureSensitiveAccess } = useSensitiveAccess();

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
        const nome = nomeExibicao(cliente);
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
      alert(err?.message || "Erro ao salvar cliente.");
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Gerencie clientes PF e PJ e seus equipamentos vinculados</p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Cliente
        </Button>
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
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : clientes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-1">Nenhum cliente encontrado</p>
              <p className="text-sm">{busca ? "Tente ajustar a busca" : "Clique em \"Novo Cliente\" para cadastrar"}</p>
            </div>
          ) : (
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
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientes.map(c => (
                    <>
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => toggleExpandir(c.id!)}>
                        <TableCell>
                          {expandido === c.id
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          }
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
                            <p>{nomeExibicao(c)}</p>
                            {c.tipo_pessoa === "PJ" && c.razao_social && c.nome_fantasia && (
                              <p className="text-xs text-muted-foreground">{c.razao_social}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono">{documentoExibicao(c)}</TableCell>
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
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" onClick={() => abrirEditar(c)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => void solicitarExclusao(c)}>
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
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
                                  {equipamentosCliente.map(eq => (
                                    <div key={eq.id} className="flex items-center justify-between p-2 rounded border bg-background">
                                      <div className="flex items-center gap-3">
                                        <Printer className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                          <p className="text-sm font-medium">{eq.marca} {eq.modelo}</p>
                                          <p className="text-xs text-muted-foreground font-mono">{eq.serial_number}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <StatusBadge status={eq.status} />
                                        <span className="text-xs text-muted-foreground">
                                          {eq.data_entrada ? new Date(eq.data_entrada).toLocaleDateString("pt-BR") : ""}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Criar/Editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* ─── Documento + Badge PF/PJ ─── */}
            <div className="space-y-2">
              <Label>CPF ou CNPJ *</Label>
              <div className="flex gap-3 items-start">
                <div className="flex-1 space-y-1">
                  <Input
                    value={form.watch("documento")}
                    onChange={(e) => {
                      const formatted = formatarDocumento(e.target.value);
                      form.setValue("documento", formatted, { shouldValidate: false });
                    }}
                    placeholder="Digite CPF ou CNPJ"
                    maxLength={18}
                  />
                  {form.formState.errors.documento && (
                    <p className="text-xs text-red-500">{form.formState.errors.documento.message}</p>
                  )}
                </div>
                {tipoPessoa && (
                  <div className="pt-1">
                    {tipoPessoa === "PF" ? (
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                        <User className="h-3 w-3 mr-1" />
                        Pessoa Física
                      </Badge>
                    ) : (
                      <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                        <Building2 className="h-3 w-3 mr-1" />
                        Pessoa Jurídica
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ─── Campos PF ─── */}
            {tipoPessoa === "PF" && (
              <div className="space-y-2 p-4 rounded-lg border border-blue-200 bg-blue-50/50">
                <Label>Nome Completo *</Label>
                <Input {...form.register("nome")} placeholder="Nome completo do cliente" />
                {form.formState.errors.nome && (
                  <p className="text-xs text-red-500">{form.formState.errors.nome.message}</p>
                )}
              </div>
            )}

            {/* ─── Campos PJ ─── */}
            {tipoPessoa === "PJ" && (
              <div className="space-y-4 p-4 rounded-lg border border-purple-200 bg-purple-50/50">
                <div className="space-y-2">
                  <Label>Razão Social *</Label>
                  <Input {...form.register("razao_social")} placeholder="Razão Social da empresa" />
                  {form.formState.errors.razao_social && (
                    <p className="text-xs text-red-500">{form.formState.errors.razao_social.message}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nome Fantasia</Label>
                    <Input {...form.register("nome_fantasia")} placeholder="Nome fantasia" />
                  </div>
                  <div className="space-y-2">
                    <Label>Inscrição Estadual</Label>
                    <Input {...form.register("inscricao_estadual")} placeholder="ISENTO ou número" />
                  </div>
                </div>
              </div>
            )}

            {/* ─── Contato ─── */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <Phone className="h-4 w-4" /> Contato
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Telefone *</Label>
                  <Input
                    value={form.watch("telefone")}
                    onChange={(e) => {
                      const formatted = formatarTelefone(e.target.value);
                      form.setValue("telefone", formatted, { shouldValidate: false });
                    }}
                    placeholder="(11) 99999-9999"
                    maxLength={15}
                  />
                  {form.formState.errors.telefone && (
                    <p className="text-xs text-red-500">{form.formState.errors.telefone.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Telefone Secundário</Label>
                  <Input
                    value={form.watch("telefone_secundario") || ""}
                    onChange={(e) => {
                      const formatted = formatarTelefone(e.target.value);
                      form.setValue("telefone_secundario", formatted, { shouldValidate: false });
                    }}
                    placeholder="(11) 3333-3333"
                    maxLength={15}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input {...form.register("email")} placeholder="email@exemplo.com" type="email" />
                {form.formState.errors.email && (
                  <p className="text-xs text-red-500">{form.formState.errors.email.message}</p>
                )}
              </div>
            </div>

            {/* ─── Endereço ─── */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Endereço
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>CEP</Label>
                  <div className="relative">
                    <Input
                      value={form.watch("cep") || ""}
                      onChange={(e) => {
                        const formatted = formatarCEP(e.target.value);
                        form.setValue("cep", formatted, { shouldValidate: false });
                      }}
                      onBlur={(e) => buscarCep(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                    {buscandoCep && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Logradouro</Label>
                  <Input {...form.register("endereco")} placeholder="Rua, Avenida..." />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Número</Label>
                  <Input {...form.register("numero")} placeholder="123" />
                </div>
                <div className="space-y-2">
                  <Label>Complemento</Label>
                  <Input {...form.register("complemento")} placeholder="Apto, Sala..." />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Bairro</Label>
                  <Input {...form.register("bairro")} placeholder="Bairro" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Cidade</Label>
                  <Input {...form.register("cidade")} />
                </div>
                <div className="space-y-2">
                  <Label>UF</Label>
                  <Input {...form.register("uf")} placeholder="SP" maxLength={2} className="uppercase" />
                </div>
              </div>
            </div>

            {/* ─── Observações ─── */}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea {...form.register("observacoes")} placeholder="Observações sobre o cliente..." rows={3} />
            </div>

            <DialogFooter>
              <DialogClose asChild><Button variant="outline" type="button">Cancelar</Button></DialogClose>
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando..." : editando ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Exclusão */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Excluir cliente <strong>{deletando ? nomeExibicao(deletando) : ""}</strong>?</p>
          <p className="text-sm text-red-500">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button variant="destructive" onClick={onDelete} disabled={salvando}>{salvando ? "Excluindo..." : "Excluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
