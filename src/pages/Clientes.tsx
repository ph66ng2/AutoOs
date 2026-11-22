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
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { classeDestaque } from "@/lib/ao-vivo";
import { useEstadoLembrado, usePrimeiraPaginaAoFiltrar } from "@/hooks/useEstadoLembrado";
import { useNavigate } from "react-router-dom";
import { formatDatePtBr } from "@/lib/date-utils";
import {
  Users,
  Search,
  Edit,
  Trash2,
  RefreshCw,
  Plus,
  ContactRound,
} from "lucide-react";
import { BotaoCopiar } from "@/components/ui/botao-copiar";
import { telefoneParaExibir } from "@/lib/contato-cliente";
import { WhatsappComMensagem } from "@/components/whatsapp/WhatsappComMensagem";
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
  digitosTelefoneBr,
} from "@/lib/validations";
import { useClientes } from "@/hooks/useClientes";
import { useNotification } from "@/hooks/useNotification";
import { db } from "@/lib/db";
import { mensagemCadastroDuplicado } from "@/lib/operator-errors";
import {
  SENSITIVE_PERMISSIONS,
  STATUS_LABELS,
  type StatusEquipamento,
  type FiltroClientes,
  type Cliente,
  type ClienteContato,
  type Equipamento,
  type RegularizacaoLegadoPrevia,
  type VinculoEmpresaPerfilInput,
  type VinculoEmpresaPerfilPrevia,
} from "@/types";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { ErrorAlert } from "@/components/ui/error-alert";
import { ListaIndisponivel } from "@/components/ui/lista-indisponivel";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { nomeExibicaoCliente, documentoExibicaoCliente } from "@/components/clientes/cliente-display-utils";
import {
  totalAbasClientes,
} from "@/pages/clientes/clientes-pagination";
import {
  ClientesDeleteDialog,
  ClientesContatosModal,
  ClientesFormDialog,
} from "@/pages/clientes/ClientesDialogs";
import { ActionPriorityRow } from "@/components/ui/action-priority-row";
import { RegularizacaoLegadosDialog } from "@/components/clientes/RegularizacaoLegadosDialog";
import { VinculoEmpresaPerfilDialog } from "@/components/clientes/VinculoEmpresaPerfilDialog";
import { PageHeader } from "@/components/PageHeader";
import { useContagemClientes, useResumoCliente } from "@/hooks/usePainelClientes";
import { useLarguraMinima } from "@/hooks/useLarguraMinima";
import { agruparHistoricoEquipamentos } from "@/lib/historico-equipamentos";

export default function Clientes() {
  const navigate = useNavigate();
  const LIMITE_EQUIPAMENTOS_EXPANDIDOS = 3;
  const FILTROS_CLIENTES: Array<{ valor: FiltroClientes; rotulo: string }> = [
    { valor: "TODOS", rotulo: "Todos" },
    { valor: "EMPRESAS", rotulo: "Empresas" },
    { valor: "PESSOAS", rotulo: "Pessoas" },
    { valor: "COM_OS_ABERTA", rotulo: "Com OS aberta" },
    { valor: "PORTAL_ATIVO", rotulo: "Portal ativo" },
  ];
  const [busca, setBusca] = useEstadoLembrado("clientes:busca", "");
  const [abaAtual, setAbaAtual] = useEstadoLembrado("clientes:pagina", 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [deletando, setDeletando] = useState<Cliente | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroDocumentoDuplicado, setErroDocumentoDuplicado] = useState<string | null>(null);
  const [tipoPessoa, setTipoPessoa] = useState<"PF" | "PJ" | null>(null);
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Equipamentos vinculados
  const [, setExpandido] = useState<number | null>(null);
  const expandidoRef = useRef<number | null>(null);
  const equipRequisicaoRef = useRef(0);
  const [filtro, setFiltro] = useEstadoLembrado<FiltroClientes>("clientes:filtro", "TODOS");
  const [equipamentosCliente, setEquipamentosCliente] = useState<Equipamento[]>([]);
  const aparelhosCliente = useMemo(() => agruparHistoricoEquipamentos(equipamentosCliente), [equipamentosCliente]);
  const [carregandoEquip, setCarregandoEquip] = useState(false);
  const [contatosClienteSelecionado, setContatosClienteSelecionado] = useState<Cliente | null>(null);
  const [contatosExpandido, setContatosExpandido] = useState<number | null>(null);
  const contatosExpandidoRef = useRef<number | null>(null);
  const contatosRequisicaoRef = useRef(0);
  const [contatosLista, setContatosLista] = useState<ClienteContato[]>([]);
  const [carregandoContatos, setCarregandoContatos] = useState(false);
  const [previaRegularizacao, setPreviaRegularizacao] = useState<RegularizacaoLegadoPrevia | null>(null);
  const [previaVinculoEmpresa, setPreviaVinculoEmpresa] = useState<VinculoEmpresaPerfilPrevia | null>(null);
  const [regularizando, setRegularizando] = useState(false);

  const { clientes, total: totalClientes, loading, error, criar, atualizar, deletar, recarregar, destaques: destaquesAoVivo } =
    useClientes({ busca: busca || undefined, page: abaAtual, filtro });
  const { data: contagem, recarregar: recarregarContagem } = useContagemClientes(busca || undefined);
  const { data: resumo } = useResumoCliente(contatosExpandido);
  // Em tela larga o painel cabe ao lado: abre o primeiro cliente, como no desenho. Sem como
  // medir a tela, não abre sozinho; se a pessoa fechar o painel, ele não reabre.
  const painelAoLado = useLarguraMinima(1280, false);
  const painelFechadoPeloUsuario = useRef(false);
  const { ensureSensitiveAccess } = useSensitiveAccess();
  const { error: showError, success } = useNotification();
  const totalAbas = totalAbasClientes(totalClientes);
  const abaExibida = Math.min(abaAtual, totalAbas);
  const clientesExibidos = clientes;

  usePrimeiraPaginaAoFiltrar([busca, filtro], () => setAbaAtual(1));

  useEffect(() => {
    if (loading) return;
    setAbaAtual((aba) => Math.min(aba, totalAbas));
  }, [totalAbas, loading, setAbaAtual]);

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      documento: "", tipo_pessoa: "PF", nome: "",
      razao_social: "", nome_fantasia: "", inscricao_estadual: "",
      telefone: "", telefone_secundario: "",
      email: "", cep: "", endereco: "", numero: "", complemento: "",
      bairro: "", cidade: "", uf: "", observacoes: "", exige_ordem_compra: false,
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
      const eraPj = Boolean(
        editando && (
          editando.tipo_pessoa === "PJ"
          || (editando.documento || editando.cpf_cnpj || "").replace(/\D/g, "").length === 14
        ),
      );
      if (editando && !eraPj) {
        form.setValue("exigir_contato_inicial", true);
      }
    } else {
      setTipoPessoa(null);
    }
  }, [documentoValue, form, editando]);

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

  /** Carrega os contatos da linha expandida; ignora resposta de requisição antiga ou de cliente que já não está expandido. */
  async function carregarContatosExpandido(cliente: Cliente) {
    const token = ++contatosRequisicaoRef.current;
    if (!cliente.empresa_id) {
      setContatosLista([]);
      setCarregandoContatos(false);
      return;
    }
    const clienteId = cliente.id!;
    const vigente = () => token === contatosRequisicaoRef.current && contatosExpandidoRef.current === clienteId;
    setCarregandoContatos(true);
    try {
      const lista = await db.listarClienteContatos(clienteId, cliente.empresa_id);
      if (vigente()) setContatosLista(lista);
    } catch (err) {
      console.error("Erro ao buscar contatos:", err);
      if (vigente()) setContatosLista([]);
    } finally {
      if (vigente()) setCarregandoContatos(false);
    }
  }

  /** Expande/recolhe a lista de contatos do cliente. Conecta-se a: db.listarClienteContatos → Rust listar_cliente_contatos */
  async function toggleContatos(cliente: Cliente) {
    if (contatosExpandidoRef.current === cliente.id) {
      contatosExpandidoRef.current = null;
      contatosRequisicaoRef.current++;
      setContatosExpandido(null);
      setContatosLista([]);
      setCarregandoContatos(false);
      return;
    }
    contatosExpandidoRef.current = cliente.id!;
    setContatosExpandido(cliente.id!);
    setContatosLista([]);
    setCarregandoContatos(false);
    await carregarContatosExpandido(cliente);
  }

  /** Ao fechar o modal de contatos, atualiza a linha se esse cliente ainda estiver expandido. */
  function fecharModalContatos() {
    const cliente = contatosClienteSelecionado;
    setContatosClienteSelecionado(null);
    if (cliente && contatosExpandidoRef.current === cliente.id) void carregarContatosExpandido(cliente);
  }

  /**
   * Expande/recolhe a linha do cliente para exibir equipamentos vinculados.
   * Busca equipamentos pelo cliente_id via db.listarEquipamentosCliente.
   * Conecta-se a: db.listarEquipamentosCliente → Rust listar_equipamentos_cliente
   */
  async function toggleExpandir(clienteId: number) {
    const token = ++equipRequisicaoRef.current;
    if (expandidoRef.current === clienteId) {
      expandidoRef.current = null;
      setExpandido(null);
      setEquipamentosCliente([]);
      setCarregandoEquip(false);
      return;
    }
    expandidoRef.current = clienteId;
    setExpandido(clienteId);
    setEquipamentosCliente([]);
    setCarregandoEquip(true);
    const vigente = () => token === equipRequisicaoRef.current;
    try {
      const cliente = clientes.find(c => c.id === clienteId);
      if (cliente) {
        const doCliente = await db.listarEquipamentosCliente(clienteId, [nomeExibicaoCliente(cliente), cliente.nome ?? ""]);
        if (vigente()) setEquipamentosCliente(doCliente);
      }
    } catch (err) {
      console.error("Erro ao buscar equipamentos:", err);
      if (vigente()) setEquipamentosCliente([]);
    } finally {
      if (vigente()) setCarregandoEquip(false);
    }
  }

  /** Abre (ou fecha, se já aberto) o cliente no painel: contatos e equipamentos juntos. */
  async function selecionarCliente(cliente: Cliente) {
    if (contatosExpandidoRef.current === cliente.id) painelFechadoPeloUsuario.current = true;
    void toggleExpandir(cliente.id!);
    await toggleContatos(cliente);
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
      bairro: "", cidade: "", uf: "", observacoes: "", exige_ordem_compra: false,
      exigir_contato_inicial: true,
      contato_nome: "", contato_telefone: "", contato_email: "",
    });
    setDialogOpen(true);
  }

  /** Abre dialog para editar cliente. Preenche form com dados existentes e detecta tipo PF/PJ */
  function abrirEditar(c: Cliente) {
    setErroDocumentoDuplicado(null);
    setEditando(c);
    const doc = c.documento || c.cpf_cnpj || "";
    const isPj = c.tipo_pessoa === "PJ" || doc.replace(/\D/g, "").length === 14;
    setTipoPessoa(isPj ? "PJ" : "PF");
    form.reset({
      documento: doc ? formatarDocumento(doc) : "",
      tipo_pessoa: isPj ? "PJ" : "PF",
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
      exige_ordem_compra: Boolean(c.exige_ordem_compra),
      exigir_contato_inicial: false,
      contato_nome: "", contato_telefone: "", contato_email: "",
    });
    // PJ antigo sem celular salva como está; o contato com celular só é exigido de quem vira PJ agora.
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
        // Edição preserva o que está salvo; o padrão (true) vale só na criação.
        receber_email: editando ? editando.receber_email : true,
        receber_whatsapp: editando ? editando.receber_whatsapp : true,
        exige_ordem_compra: Boolean(data.exige_ordem_compra),
        observacoes: data.observacoes || null,
        ativo: true,
        atualizado_em: editando?.atualizado_em,
      } as any;

      const contatoInicial = isPJ && data.exigir_contato_inicial
        ? {
            nome: (data.contato_nome ?? "").trim(),
            telefone: digitosTelefoneBr(data.contato_telefone ?? ""),
            email: data.contato_email?.trim() || undefined,
          }
        : undefined;
      if (editando) {
        const resultado = await atualizar(editando.id!, payload, contatoInicial);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível salvar o cliente.");
        }
      } else {
        const resultado = await criar(payload, contatoInicial);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível criar o cliente.");
        }
      }
      setDialogOpen(false);
    } catch (err: any) {
      console.error("Erro:", err);
      const message = err instanceof Error ? err.message : String(err);
      const duplicado = mensagemCadastroDuplicado(message);
      if (duplicado || message.toLowerCase().includes("cpf/cnpj já está cadastrado")) {
        setErroDocumentoDuplicado(duplicado ?? message);
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

  const primeiroCliente = clientesExibidos[0];
  useEffect(() => {
    if (!painelAoLado || painelFechadoPeloUsuario.current || contatosExpandidoRef.current != null || !primeiroCliente) return;
    void selecionarCliente(primeiroCliente);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painelAoLado, primeiroCliente?.id]);
  const clienteAberto = clientesExibidos.find((c) => c.id === contatosExpandido) ?? null;
  const cadastrados = (n: number) => `${n} ${n === 1 ? "cadastrado" : "cadastrados"}`;
  const contagemFiltro = (valor: FiltroClientes) => {
    if (!contagem) return undefined;
    const porFiltro: Record<FiltroClientes, number> = { TODOS: contagem.todos, EMPRESAS: contagem.empresas, PESSOAS: contagem.pessoas, COM_OS_ABERTA: contagem.comOsAberta, PORTAL_ATIVO: contagem.portalAtivo };
    return porFiltro[valor];
  };
  const moedaCompacta = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });
  const situacaoPortal = (ct: ClienteContato) =>
    ct.portal_acesso === "NENHUM" || !ct.portal_acesso ? "sem portal" : ct.portal_senha_definida_em ? "portal ativo" : "sem senha";
  const canaisContato = (ct: ClienteContato) => [ct.telefone ? "WhatsApp" : null, ct.email ? "e-mail" : null].filter(Boolean).join(" · ") || "sem canal";
  const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((parte) => parte[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        titulo="Clientes"
        descricao={contagem ? `${cadastrados(contagem.todos)} · ${contagem.comOsAberta} com OS aberta` : loading ? "Carregando…" : cadastrados(totalClientes)}
      >
        <Button variant="outline" onClick={() => void abrirRegularizacaoLegados()}>
          Regularizar cadastros
        </Button>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-1" />
          Novo cliente
        </Button>
      </PageHeader>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        {/* Lista: filtros, busca, tabela e paginação */}
        <Card className="flex min-w-0 flex-col rounded-2xl">
          <CardContent className="flex flex-1 flex-col gap-4 p-5">
            <div role="group" aria-label="Filtrar clientes" className="flex flex-wrap gap-2">
              {FILTROS_CLIENTES.map((opcao) => {
                const ligado = filtro === opcao.valor;
                const numero = contagemFiltro(opcao.valor);
                return (
                  <button
                    key={opcao.valor}
                    type="button"
                    aria-pressed={ligado}
                    onClick={() => setFiltro(opcao.valor)}
                    className={`inline-flex h-8 items-center gap-2 rounded-full pl-3 pr-2 text-[13px] font-semibold transition-colors duration-rapida focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ligado ? "bg-foreground text-background" : "bg-card text-foreground shadow-[inset_0_0_0_1px_hsl(var(--ctl))] hover:bg-muted"}`}
                  >
                    {opcao.rotulo}
                    {numero != null && (
                      <span className={`rounded-full px-2 text-xs font-semibold tabular-nums ${ligado ? "bg-background/20" : "bg-secondary text-muted-foreground"}`}>{numero}</span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Nome, CPF/CNPJ, contato ou telefone" aria-label="Buscar clientes" value={busca} onChange={e => setBusca(e.target.value)} className="h-10 bg-muted pl-9" />
              </div>
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Atualizar clientes" onClick={() => { void recarregar(); void recarregarContagem(); }}><RefreshCw className="h-4 w-4" /></Button>
            </div>
            {error && (
              <ErrorAlert variant="error" context="Clientes" message={error} action="Carregar" />
            )}
            {loading ? (
              <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
            ) : clientes.length === 0 && error ? (
              <ListaIndisponivel oque="clientes" onTentarDeNovo={() => { void recarregar(); void recarregarContagem(); }} />
            ) : clientes.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg font-medium mb-1">Nenhum cliente encontrado</p>
                <p className="text-sm">{busca || filtro !== "TODOS" ? "Tente ajustar a busca ou o filtro" : "Clique em \"Novo cliente\" para cadastrar"}</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[46rem] text-sm" aria-label="Clientes">
                    <thead className="bg-muted text-left text-xs font-semibold text-muted-foreground">
                      <tr className="[&>th]:h-11 [&>th]:px-3 [&>th]:align-middle">
                        <th>Cliente</th>
                        <th>Contato principal</th>
                        <th>Cidade</th>
                        <th className="text-right">OS abertas</th>
                        <th>Último atendimento</th>
                        <th className="w-12"><span className="sr-only">Ações</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {clientesExibidos.map(c => {
                        const aberto = contatosExpandido === c.id;
                        return (
                          <tr
                            key={c.id}
                            className={`cursor-pointer transition-colors duration-lenta [&>td]:px-3 [&>td]:py-2.5 [&>td]:align-middle ${aberto ? "bg-muted shadow-[inset_3px_0_0_hsl(var(--primary))]" : "hover:bg-muted/50"} ${c.id != null ? classeDestaque(destaquesAoVivo?.get(c.id)) : ""}`}
                            onClick={() => void selecionarCliente(c)}
                          >
                            <td className="min-w-0">
                              <div className="flex min-w-0 items-center gap-3">
                                <span
                                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-secondary text-[11px] font-extrabold text-muted-foreground"
                                  title={c.tipo_pessoa === "PJ" ? "Pessoa jurídica" : "Pessoa física"}
                                >
                                  {c.tipo_pessoa === "PJ" ? "PJ" : "PF"}
                                </span>
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    aria-pressed={aberto}
                                    className="block max-w-full truncate text-left font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                                    onClick={(event) => { event.stopPropagation(); void selecionarCliente(c); }}
                                  >
                                    {nomeExibicaoCliente(c)}
                                  </button>
                                  <span className="block truncate font-mono text-xs text-muted-foreground">{documentoExibicaoCliente(c)}</span>
                                  {c.exige_ordem_compra && (
                                    <Badge
                                      variant="outline"
                                      className="mt-0.5 border-status-wait/30 bg-status-wait-bg text-[10px] font-normal text-status-wait"
                                      title="O Portal do Cliente exige o número da ordem de compra para aceitar orçamentos"
                                    >
                                      Exige OC
                                    </Badge>
                                  )}
                                  {c.contato_encontrado && (
                                    <p className="truncate text-xs text-muted-foreground">Contato: {c.contato_encontrado}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="max-w-[12rem] truncate">{c.contato_principal || <span className="text-muted-foreground">—</span>}</td>
                            <td className="max-w-[10rem] truncate text-muted-foreground">{c.cidade || "—"}</td>
                            <td className="text-right font-semibold tabular-nums">{c.os_abertas ?? "—"}</td>
                            <td className="tabular-nums text-muted-foreground">{c.ultimo_atendimento ? formatDatePtBr(c.ultimo_atendimento).slice(0, 5) : "—"}</td>
                            <td onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                              <ActionPriorityRow
                                acaoDaLinha
                                semPrincipal
                                menuTitulo={nomeExibicaoCliente(c)}
                                primary={{ id: `abrir-${c.id}`, label: "Abrir cliente", onClick: () => void selecionarCliente(c) }}
                                overflow={[
                                  { id: `editar-${c.id}`, label: "Editar", icon: <Edit className="h-4 w-4" />, onClick: () => void abrirEditar(c) },
                                  { id: `gerenciar-contatos-${c.id}`, label: "Contatos e Portal", icon: <ContactRound className="h-4 w-4" />, onClick: () => setContatosClienteSelecionado(c) },
                                  { id: `excluir-${c.id}`, label: "Excluir", icon: <Trash2 className="h-4 w-4" />, className: "text-destructive", onClick: () => void solicitarExclusao(c) },
                                ]}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  page={abaExibida}
                  totalPages={totalAbas}
                  onPageChange={setAbaAtual}
                  label="Paginação de clientes"
                  totalItems={totalClientes}
                  className="mt-auto pb-0"
                />
              </>
            )}
          </CardContent>
        </Card>

        {/* Painel do cliente aberto */}
        <Card className="rounded-2xl">
          <CardContent className="space-y-5 p-5">
            {!clienteAberto ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Selecione um cliente para ver contatos e equipamentos.</p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{clienteAberto.tipo_pessoa === "PJ" ? "Empresa" : "Pessoa"}</p>
                    <h2 className="break-words text-xl font-extrabold leading-7">{nomeExibicaoCliente(clienteAberto)}</h2>
                    <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      {documentoExibicaoCliente(clienteAberto)}
                      {documentoExibicaoCliente(clienteAberto) !== "—" && (
                        <BotaoCopiar valor={(clienteAberto.documento || clienteAberto.cpf_cnpj || "").replace(/\D/g, "")} rotulo="CPF/CNPJ" />
                      )}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={() => void abrirEditar(clienteAberto)}>Editar</Button>
                </div>

                {(clienteAberto.telefone?.trim() || clienteAberto.email?.trim()) && (
                  <ul aria-label="Contato do cliente" className="space-y-1 text-sm">
                    {clienteAberto.telefone?.trim() && (
                      <li className="flex items-center gap-1">
                        <span className="tabular-nums">{telefoneParaExibir(clienteAberto.telefone)}</span>
                        <BotaoCopiar valor={telefoneParaExibir(clienteAberto.telefone)} rotulo="telefone" />
                        <WhatsappComMensagem
                          className="ml-auto h-7"
                          telefone={clienteAberto.telefone}
                          dados={{ cliente: nomeExibicaoCliente(clienteAberto), contato: clienteAberto.contato_principal || nomeExibicaoCliente(clienteAberto) }}
                          onErro={(err) => showError("Clientes", "Abrir WhatsApp", err)}
                        />
                      </li>
                    )}
                    {clienteAberto.email?.trim() && (
                      <li className="flex min-w-0 items-center gap-1">
                        <span className="truncate">{clienteAberto.email.trim()}</span>
                        <BotaoCopiar valor={clienteAberto.email.trim()} rotulo="e-mail" />
                      </li>
                    )}
                  </ul>
                )}

                <div className={`grid gap-2 ${resumo?.faturado != null ? "grid-cols-3" : "grid-cols-2"}`}>
                  <div className="flex flex-col justify-between gap-1 rounded-xl bg-muted p-3">
                    <p className="text-xs text-muted-foreground">OS abertas</p>
                    <p className="text-lg font-extrabold tabular-nums">{resumo?.osAbertas ?? clienteAberto.os_abertas ?? "—"}</p>
                  </div>
                  <div className="flex flex-col justify-between gap-1 rounded-xl bg-muted p-3">
                    <p className="text-xs text-muted-foreground" title="OS que entraram neste ano, abertas ou já fechadas">No ano</p>
                    <p className="text-lg font-extrabold tabular-nums">{resumo?.noAno ?? "—"}</p>
                  </div>
                  {resumo?.faturado != null && (
                    <div className="flex flex-col justify-between gap-1 rounded-xl bg-muted p-3" title="Entregues no ano: valor final ou orçado. Só para quem vê Finanças.">
                      <p className="text-xs text-muted-foreground">Faturado</p>
                      <p className="whitespace-nowrap text-lg font-extrabold tabular-nums">{moedaCompacta.format(resumo.faturado)}</p>
                    </div>
                  )}
                </div>

                <section id={`contatos-cliente-${clienteAberto.id}`} aria-label="Contatos" className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold">Contatos</h3>
                    {clienteAberto.empresa_id && (
                      <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => setContatosClienteSelecionado(clienteAberto)}>
                        + Contato
                      </button>
                    )}
                  </div>
                  {!clienteAberto.empresa_id ? (
                    <p className="text-sm italic text-status-wait">Cliente sem empresa vinculada — contatos indisponíveis</p>
                  ) : carregandoContatos ? (
                    <p className="text-sm text-muted-foreground">Carregando contatos...</p>
                  ) : contatosLista.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum contato cadastrado</p>
                  ) : (
                    <ul className="space-y-2">
                      {contatosLista.map(ct => (
                        <li key={ct.id}>
                          <button
                            type="button"
                            onClick={() => setContatosClienteSelecionado(clienteAberto)}
                            title="Abrir contatos e portal"
                            className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors duration-rapida hover:border-ctl"
                          >
                            <span aria-hidden="true" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold">{iniciais(ct.nome)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-sm font-semibold">{ct.nome}</span>
                                {ct.nome === clienteAberto.contato_principal && (
                                  <span className="shrink-0 rounded-full bg-acc-soft px-2 text-[10px] font-semibold text-acc-soft-foreground">responsável</span>
                                )}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {canaisContato(ct)}
                                {ct.email && <> · <span>{ct.email}</span></>}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{situacaoPortal(ct)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section id={`equipamentos-cliente-${clienteAberto.id}`} aria-label="Equipamentos deste cliente" className="space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-bold">Equipamentos deste cliente</h3>
                    <span className="flex items-center gap-3">
                      {aparelhosCliente.length > 0 && (
                        <button type="button" className="text-sm font-semibold text-primary hover:underline" onClick={() => navigate(`/clientes/${clienteAberto.id}/equipamentos`)}>
                          {aparelhosCliente.length > LIMITE_EQUIPAMENTOS_EXPANDIDOS ? `Ver todos (${aparelhosCliente.length})` : "Histórico"}
                        </button>
                      )}
                      {/* Nova entrada já com este cliente; Cancelar e salvar voltam para Clientes. */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate("/equipamentos/nova", { state: { origem: "/clientes", clienteId: clienteAberto.id } })}
                      >
                        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        Nova entrada
                      </Button>
                    </span>
                  </div>
                  {carregandoEquip ? (
                    <p className="py-2 text-sm text-muted-foreground">Carregando equipamentos...</p>
                  ) : equipamentosCliente.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">Nenhum equipamento vinculado</p>
                  ) : (
                    <ul className="divide-y">
                      {aparelhosCliente.slice(0, LIMITE_EQUIPAMENTOS_EXPANDIDOS).map(aparelho => (
                        <li key={aparelho.chave}>
                          <button
                            type="button"
                            onClick={() => navigate("/equipamentos", { state: { equipamentoId: aparelho.passagens[0].id } })}
                            className="flex w-full items-start justify-between gap-3 py-2.5 text-left hover:text-primary"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">{aparelho.marca} {aparelho.modelo}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                <span className="font-mono">{aparelho.serial}</span>
                                {aparelho.passagens.length > 1 && <> · {aparelho.passagens.length} passagens</>}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABELS[aparelho.statusAtual as StatusEquipamento] ?? aparelho.statusAtual}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {clienteAberto.empresa_id && (
                  <Button
                    variant="ghost"
                    className="h-11 w-full bg-acc-soft font-semibold text-acc-soft-foreground hover:bg-acc-soft/70 hover:text-acc-soft-foreground"
                    onClick={() => setContatosClienteSelecionado(clienteAberto)}
                  >
                    Gerenciar acesso ao portal
                  </Button>
                )}

              </>
            )}
          </CardContent>
        </Card>
      </div>

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

      <ClientesContatosModal
        open={Boolean(contatosClienteSelecionado)}
        onOpenChange={(open) => { if (!open) fecharModalContatos(); }}
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
