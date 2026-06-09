/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  Equipamentos.tsx — Página Principal de Equipamentos        ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Página CRUD completa com 5 dialogs e fluxo de 12 status:  ║
 * ║  1. Dialog Criar/Editar → form + ClienteSelector            ║
 * ║  2. Dialog Detalhes → 4 abas (Info, Verificação, Histórico, ║
 * ║     Comunicações)                                            ║
 * ║  3. Dialog Verificação Técnica → VerificacaoTecnica.tsx     ║
 * ║  4. Dialog Mudar Status → campos extras por status          ║
 * ║  5. Dialog Confirmar Exclusão                                ║
 * ║                                                              ║
 * ║  DEPENDE DE:                                                 ║
 * ║  - hooks/useEquipamentos (CRUD + listagem)                  ║
 * ║  - hooks/useStatusEquipamento (automação de transições)     ║
 * ║  - components/ClienteSelector (busca/cadastro de cliente)   ║
 * ║  - components/VerificacaoTecnica (dialog de verificação)    ║
 * ║  - components/HistoricoComunicacoes (aba comunicações)      ║
 * ║  - lib/db.ts (busca direta de verificação e comunicações)   ║
 * ║  - lib/whatsapp-service.ts (envio manual de WhatsApp)       ║
 * ║  - lib/validations.ts (equipamentoSchema)                   ║
 * ║  - types/index.ts (STATUS_LABELS, STATUS_COLORS, etc.)      ║
 * ║                                                              ║
 * ║  USADO POR: App.tsx (rota /equipamentos)                    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Printer,
  Plus,
  Search,
  Edit,
  Trash2,
  Filter,
  RefreshCw,
  MessageSquare,
  ClipboardCheck,
  Users,
  Play,
  CheckCircle,
  XCircle,
  Wrench,
  PackageCheck,
  History,
  Send,
  FileText,
  FileDown,
  ImagePlus,
  Eye,
  Download,
  Smartphone,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { equipamentoSchema, type EquipamentoFormData } from "@/lib/validations";
import { useEquipamentos } from "@/hooks/useEquipamentos";
import { useStatusEquipamento } from "@/hooks/useStatusEquipamento";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { WhatsAppService } from "@/lib/whatsapp-service";
import { EmailService } from "@/lib/email-service";
import { PdfService } from "@/lib/pdf-service";
import { FormValidationError } from "@/components/ui/form-validation-error";
import { db } from "@/lib/db";
import {
  STATUS_LABELS,
  SENSITIVE_PERMISSIONS,
  type Equipamento,
  type EquipamentoImagemCategoria,
  type EquipamentoImagemInput,
  type Cliente,
  type StatusEquipamento,
  type ItemVerificacao,
  type ServicoNecessario,
  type PecaNecessaria,
  type Verificacao,
  type Comunicacao,
} from "@/types";

// Componentes extraídos
import {
  VerificacaoTecnica,
  type DadosVerificacao,
  type TecnicoDisponivel,
} from "@/components/equipamentos/VerificacaoTecnica";
import { HistoricoComunicacoes } from "@/components/equipamentos/HistoricoComunicacoes";
import { ClienteSelector } from "@/components/equipamentos/ClienteSelector";
import { PhotoUploadDialog } from "@/components/equipamentos/PhotoUploadDialog";
import { DocumentosEquipamento } from "@/components/equipamentos/DocumentosEquipamento";
import { ActionPriorityRow, type PriorityAction } from "@/components/ui/action-priority-row";
import {
  arquivoParaImagemEquipamento,
  bytesParaDataUrl,
  imagemPersistidaParaDraft,
  LIMITE_IMAGENS_POR_EQUIPAMENTO,
  normalizarOrdemPorCategoria,
  type EquipamentoImagemDraft,
} from "@/lib/equipamento-imagem-utils";
import {
  EMAIL_POR_TECNICO,
  STATUS_OPTIONS,
  TECNICOS_DISPONIVEIS,
  TIPO_OPTIONS,
} from "@/pages/equipamentos/equipamentos-page-constants";
import { GaleriaImagensEquipamento } from "@/pages/equipamentos/EquipamentosPageGallery";
import { StatusBadge } from "@/pages/equipamentos/EquipamentosStatusBadge";
import {
  emailValido,
  extrairTecnicoInicialDeObservacoes,
  filtrarImagensPorCategoria,
  getProximosStatus,
  mensagemResultadoCanais,
  removerTecnicoInicialDasObservacoes,
  statusExigeAcessoSensivel,
  whatsappNaoConfigurado,
} from "@/pages/equipamentos/equipamentos-page-utils";
import { useNotification } from "@/hooks/useNotification";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InputDialog } from "@/components/ui/input-dialog";
import { ErrorAlert } from "@/components/ui/error-alert";

export default function Equipamentos() {
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("TODOS");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detalhesDialogOpen, setDetalhesDialogOpen] = useState(false);
  const [verificacaoDialogOpen, setVerificacaoDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Equipamento | null>(null);
  const [deletando, setDeletando] = useState<Equipamento | null>(null);
  const [selecionado, setSelecionado] = useState<Equipamento | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Duplicidade de serial (múltiplos ciclos de manutenção)
  const [registrosAnteriores, setRegistrosAnteriores] = useState<Equipamento[]>([]);
  const [confirmouNovoCiclo, setConfirmouNovoCiclo] = useState(false);

  // Dados do drawer de detalhes
  const [verificacaoDetalhes, setVerificacaoDetalhes] = useState<Verificacao | null>(null);
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  const [imagensDetalhes, setImagensDetalhes] = useState<EquipamentoImagemDraft[]>([]);
  const [carregandoDetalhes, setCarregandoDetalhes] = useState(false);

  // Mudança de status
  const [novoStatus, setNovoStatus] = useState("");
  const [valorOrcamento, setValorOrcamento] = useState<number>(0);
  const [prazoAprovacao, setPrazoAprovacao] = useState("");
  const [valorOrcamentoOriginal, setValorOrcamentoOriginal] = useState<number | null>(null);
  const [valorOrcamentoAnterior, setValorOrcamentoAnterior] = useState<number | null>(null);
  const [valorFinal, setValorFinal] = useState<number>(0);
  const [valorFinalSugerido, setValorFinalSugerido] = useState<number | null>(null);
  const [acordoExcecaoEntrega, setAcordoExcecaoEntrega] = useState(false);
  const [tecnicoNovoEquipamento, setTecnicoNovoEquipamento] = useState<TecnicoDisponivel>("Ivan");
  const [imagensSaidaEntrega, setImagensSaidaEntrega] = useState<EquipamentoImagemDraft[]>([]);
  const [erroImagensSaidaEntrega, setErroImagensSaidaEntrega] = useState<string | null>(null);
  const [carregandoImagensSaidaEntrega, setCarregandoImagensSaidaEntrega] = useState(false);
  const [imagemExpandida, setImagemExpandida] = useState<EquipamentoImagemDraft | null>(null);

  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [photoUploadCategoria, setPhotoUploadCategoria] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [photoUploadNewEquip, setPhotoUploadNewEquip] = useState(false);

  // Cliente vinculado ao equipamento (gerenciado pelo ClienteSelector)
  const [clienteVinculado, setClienteVinculado] = useState<Cliente | null>(null);
  const [erroCliente, setErroCliente] = useState<string | null>(null);
  const [imagensFormulario, setImagensFormulario] = useState<EquipamentoImagemDraft[]>([]);
  const [erroImagens, setErroImagens] = useState<string | null>(null);
  const [carregandoImagensFormulario, setCarregandoImagensFormulario] = useState(false);

  const { success, error: showError, warning } = useNotification();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmProps, setConfirmProps] = useState<{
    title: string;
    description: string;
    variant?: "default" | "destructive";
    onConfirm: () => void;
    onCancel?: () => void;
    closeLabel?: string;
    onClose?: () => void;
  }>({ title: "", description: "", onConfirm: () => {} });

  const [inputOpen, setInputOpen] = useState(false);
  const [inputProps, setInputProps] = useState<{
    title: string;
    description?: string;
    label: string;
    placeholder?: string;
    onConfirm: (value: string) => void;
  }>({ title: "", label: "", onConfirm: () => {} });

  const { equipamentos, loading, criar, atualizar, deletar, atualizarStatus, recarregar } =
    useEquipamentos({ busca: busca || undefined, status: statusFiltro });

  // Hook de automação de status
  const { loading: loadingAutomacao, finalizarVerificacao, marcarComoPronto } =
    useStatusEquipamento();
  const { ensureSensitiveAccess } = useSensitiveAccess();

  const carregarImagensComPreview = useCallback(async (equipamentoId: number) => {
    const imagens = await db.listarImagensEquipamento(equipamentoId);
    return Promise.all(imagens.map(imagemPersistidaParaDraft));
  }, []);

  const form = useForm<EquipamentoFormData>({
     resolver: zodResolver(equipamentoSchema),
      defaultValues: {
        serial_number: "", patrimonio: "", marca: "", modelo: "", tipo: "", status: "RECEBIDO",
        defeito_relatado: "", acessorios: [], acessorios_outros: "",
        observacoes: "",
      },
  });

  // ─── Handlers ─────────────────────────────────────────

  /** Abre dialog para criar novo equipamento. Reseta form e limpa cliente */
  function abrirNovo() {
    setEditando(null);
    setClienteVinculado(null);
    setErroCliente(null);
    setErroImagens(null);
    setImagensFormulario([]);
    setCarregandoImagensFormulario(false);
    setTecnicoNovoEquipamento("Ivan");
    setRegistrosAnteriores([]);
    setConfirmouNovoCiclo(false);
    form.reset({
      serial_number: "", patrimonio: "", marca: "", modelo: "", tipo: "", status: "RECEBIDO",
      defeito_relatado: "", acessorios: [], acessorios_outros: "",
      observacoes: "",
    });
    setDialogOpen(true);
  }

  /** Abre dialog para editar equipamento existente. Carrega cliente vinculado do banco */
  function abrirEditar(eq: Equipamento) {
    setEditando(eq);
    setErroCliente(null);
    setErroImagens(null);
    setImagensFormulario([]);
    setCarregandoImagensFormulario(true);
    setTecnicoNovoEquipamento(extrairTecnicoInicialDeObservacoes(eq.observacoes) || "Ivan");
    void carregarImagensComPreview(eq.id!)
      .then((imagens) => {
        setImagensFormulario(normalizarOrdemPorCategoria(imagens));
      })
      .catch((err) => {
        console.error("Erro ao carregar imagens do equipamento:", err);
        setErroImagens("Não foi possível carregar as fotos já cadastradas.");
      })
      .finally(() => {
        setCarregandoImagensFormulario(false);
      });
    // Se o equipamento tem cliente_id, carregar do banco; senão, montar objeto parcial
    if (eq.cliente_id) {
      db.buscarCliente(eq.cliente_id).then((c) => {
        setClienteVinculado(c || null);
      }).catch(() => {
        // Fallback: usar dados denormalizados
        if (eq.cliente_nome) {
          setClienteVinculado({
            id: eq.cliente_id,
            nome: eq.cliente_nome,
            telefone: eq.cliente_telefone || "",
            email: eq.cliente_email || undefined,
          } as Cliente);
        } else {
          setClienteVinculado(null);
        }
      });
    } else if (eq.cliente_nome) {
      // Equipamento legado sem cliente_id — exibir dados que tem
      setClienteVinculado({
        nome: eq.cliente_nome,
        telefone: eq.cliente_telefone || "",
        email: eq.cliente_email || undefined,
      } as Cliente);
    } else {
      setClienteVinculado(null);
    }
    form.reset({
      serial_number: eq.serial_number, patrimonio: eq.patrimonio || "", marca: eq.marca, modelo: eq.modelo,
      tipo: eq.tipo, status: eq.status, defeito_relatado: eq.defeito_relatado || "",
      acessorios: eq.acessorios ? eq.acessorios.split(", ").filter(Boolean) : [], acessorios_outros: eq.acessorios_outros || "", observacoes: removerTecnicoInicialDasObservacoes(eq.observacoes || ""),
    });
    setDialogOpen(true);
  }

  async function handleSelecionarImagens(
    event: React.ChangeEvent<HTMLInputElement>,
    categoria: EquipamentoImagemCategoria,
  ) {
    const arquivos = Array.from(event.target.files || []);
    event.target.value = "";
    if (arquivos.length === 0) return;

    const vagasRestantes = LIMITE_IMAGENS_POR_EQUIPAMENTO - imagensFormulario.length;
    if (vagasRestantes <= 0) {
      setErroImagens(`Limite de ${LIMITE_IMAGENS_POR_EQUIPAMENTO} fotos por equipamento já atingido.`);
      return;
    }

    const arquivosProcessados = arquivos.slice(0, vagasRestantes);
    setCarregandoImagensFormulario(true);
    try {
      const novasImagens = await Promise.all(
        arquivosProcessados.map((arquivo, index) =>
          arquivoParaImagemEquipamento(
            arquivo,
            filtrarImagensPorCategoria(imagensFormulario, categoria).length + index,
            categoria,
          )
        )
      );

      setImagensFormulario((estadoAtual) =>
        normalizarOrdemPorCategoria([...estadoAtual, ...novasImagens])
      );
      setErroImagens(
        arquivos.length > arquivosProcessados.length
          ? `Somente ${LIMITE_IMAGENS_POR_EQUIPAMENTO} fotos podem ser mantidas por equipamento.`
          : null
      );
    } catch (err: any) {
      console.error("Erro ao processar imagens do equipamento:", err);
      setErroImagens(err?.message || "Não foi possível processar as fotos selecionadas.");
    } finally {
      setCarregandoImagensFormulario(false);
    }
  }

  /** Ao perder foco no campo serial, busca registros existentes com mesmo número de série */
  async function handleSerialBlur() {
    const serial = form.getValues("serial_number");
    if (!serial || serial.trim().length < 3) {
      setRegistrosAnteriores([]);
      setConfirmouNovoCiclo(false);
      return;
    }
    try {
      const registros = await db.buscarEquipamentosPorSerial(serial);
      // Quando editando, excluir o registro atual da lista de anteriores
      const anteriores = editando
        ? registros.filter((r) => r.id !== editando.id)
        : registros;
      setRegistrosAnteriores(anteriores);
      setConfirmouNovoCiclo(false);
    } catch (err) {
      console.error("Erro ao buscar registros anteriores:", err);
    }
  }

  function removerImagemFormulario(localId: string) {
    setImagensFormulario((estadoAtual) =>
      normalizarOrdemPorCategoria(estadoAtual.filter((imagem) => imagem.local_id !== localId))
    );
    setErroImagens(null);
  }

  function atualizarLegendaImagem(localId: string, value: string) {
    setImagensFormulario((estadoAtual) =>
      estadoAtual.map((imagem) => (
        imagem.local_id === localId
          ? { ...imagem, observacao: value.slice(0, 280) }
          : imagem
      ))
    );
  }

  /**
   * Abre dialog de detalhes com 4 abas. Carrega verificação e comunicações em paralelo.
   * Conecta-se a: db.buscarVerificacao, db.listarComunicacoes
   */
  const abrirDetalhes = useCallback(async (eq: Equipamento) => {
    setSelecionado(eq);
    setDetalhesDialogOpen(true);
    setCarregandoDetalhes(true);
    setVerificacaoDetalhes(null);
    setComunicacoes([]);
    setImagensDetalhes([]);
    try {
      const [verif, comms, imagens] = await Promise.allSettled([
        db.buscarVerificacao(eq.id!),
        db.listarComunicacoes(eq.id!),
        carregarImagensComPreview(eq.id!),
      ]);
      setVerificacaoDetalhes(verif.status === "fulfilled" ? verif.value : null);
      setComunicacoes(comms.status === "fulfilled" ? comms.value : []);
      setImagensDetalhes(imagens.status === "fulfilled" ? imagens.value : []);
    } catch (err) {
      console.error("Erro ao carregar detalhes:", err);
    } finally {
      setCarregandoDetalhes(false);
    }
  }, [carregarImagensComPreview]);

  /** Abre dialog de verificação técnica (VerificacaoTecnica.tsx) */
  function abrirVerificacao(eq: Equipamento) {
    setSelecionado(eq);
    setVerificacaoDialogOpen(true);
  }

  /** Abre dialog de mudança manual de status com opção de pré-selecionar o status */
  async function prepararValorEntregaPadrao(eq: Equipamento) {
    const verificacao = await db.buscarVerificacao(eq.id!);
    const sugerido = verificacao?.custo_total ?? eq.valor_orcamento ?? 0;
    setValorFinalSugerido(sugerido);
    setValorFinal(sugerido);
    setAcordoExcecaoEntrega(false);
  }

  async function prepararAjusteOrcamentoPadrao(eq: Equipamento) {
    const verificacao = await db.buscarVerificacao(eq.id!);
    const valorOriginal = verificacao?.custo_total ?? null;
    const valorAnterior = eq.valor_orcamento ?? null;
    const valorBase = eq.valor_orcamento ?? verificacao?.custo_total ?? 0;
    setValorOrcamentoOriginal(valorOriginal);
    setValorOrcamentoAnterior(valorAnterior);
    setValorOrcamento(valorBase);
    setPrazoAprovacao(eq.prazo_aprovacao || "");
  }

  function handleNovoStatusChange(status: string) {
    setNovoStatus(status);
    if (status === "ENTREGUE" && selecionado) {
      void prepararValorEntregaPadrao(selecionado);
    } else {
      setValorFinalSugerido(null);
      setAcordoExcecaoEntrega(false);
    }
  }

  async function abrirMudarStatus(eq: Equipamento, statusPreSelecionado?: string) {
    const liberado = await ensureSensitiveAccess({
      title: "Alterar status sensível",
      description: "Informe o PIN para alterar status comerciais, prazos e valores do equipamento.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) return;

    setSelecionado(eq);
    setNovoStatus(statusPreSelecionado || "");
    setValorOrcamento(eq.valor_orcamento ?? 0);
    setPrazoAprovacao(eq.prazo_aprovacao || "");
    setValorOrcamentoOriginal(null);
    setValorOrcamentoAnterior(null);
    setValorFinal(0);
    setValorFinalSugerido(null);
    setAcordoExcecaoEntrega(false);
    setErroImagensSaidaEntrega(null);
    setImagensSaidaEntrega([]);
    if ((statusPreSelecionado || "") === "ENTREGUE") {
      await prepararValorEntregaPadrao(eq);
      setCarregandoImagensSaidaEntrega(true);
      try {
        const imagens = await carregarImagensComPreview(eq.id!);
        setImagensSaidaEntrega(filtrarImagensPorCategoria(imagens, "SAIDA"));
      } catch (err) {
        console.error("Erro ao carregar fotos de saída para entrega:", err);
        setErroImagensSaidaEntrega("Não foi possível carregar as fotos de saída já cadastradas.");
      } finally {
        setCarregandoImagensSaidaEntrega(false);
      }
    }
    if ((statusPreSelecionado || "") === "AGUARDANDO_APROVACAO") {
      await prepararAjusteOrcamentoPadrao(eq);
    }
    setStatusDialogOpen(true);
  }

  /**
   * Salva equipamento (criar ou editar). Valida que cliente foi vinculado.
   * Monta payload com dados do form + dados denormalizados do cliente.
   * Conecta-se a: useEquipamentos.criar/atualizar → db → Rust
   */
  async function onSubmit(data: EquipamentoFormData) {
    // Validar que um cliente foi vinculado
    if (!clienteVinculado) {
      setErroCliente("Selecione ou cadastre um cliente antes de salvar.");
      return;
    }
    setErroCliente(null);
    setSalvando(true);
    try {
      // Nome de exibição do cliente
      const nomeCliente = clienteVinculado.tipo_pessoa === "PJ"
        ? (clienteVinculado.nome_fantasia || clienteVinculado.razao_social || clienteVinculado.nome || "")
        : (clienteVinculado.nome || "");

      const acessoriosTexto = (data.acessorios || []).filter(Boolean).join(", ");

      const observacoesSemTecnico = removerTecnicoInicialDasObservacoes(data.observacoes || "");
      const emailTecnicoInicial = EMAIL_POR_TECNICO[tecnicoNovoEquipamento] || "";
      const linhaTecnicoInicial = `Técnico inicial: ${tecnicoNovoEquipamento}${emailTecnicoInicial ? ` (${emailTecnicoInicial})` : ""}`;
      const observacoesComTecnico = [linhaTecnicoInicial, observacoesSemTecnico]
        .filter(Boolean)
        .join("\n");

      const payload: any = {
        serial_number: data.serial_number, patrimonio: data.patrimonio || null, marca: data.marca, modelo: data.modelo,
        tipo: data.tipo, status: data.status || "RECEBIDO",
        defeito_relatado: data.defeito_relatado,
        acessorios: acessoriosTexto || null,
        acessorios_outros: data.acessorios_outros || null,
        data_entrada: editando?.data_entrada || new Date().toISOString().split("T")[0],
        observacoes: observacoesComTecnico || null,
        // Vínculo real com o cliente
        cliente_id: clienteVinculado.id || null,
        // Dados denormalizados para exibição rápida
        cliente_nome: nomeCliente,
        cliente_telefone: clienteVinculado.telefone || null,
        cliente_email: clienteVinculado.email || null,
        atualizado_em: editando?.atualizado_em,
      };
      const imagensPayload: EquipamentoImagemInput[] = normalizarOrdemPorCategoria(imagensFormulario)
        .map(({ local_id, preview_url, ...imagem }) => imagem);
      const resultado = editando
        ? await atualizar(editando.id!, payload)
        : await criar(payload);

      if (!resultado.sucesso || !resultado.data?.id) {
        throw new Error(resultado.erro || "Não foi possível salvar o equipamento.");
      }

      try {
        await db.substituirImagensEquipamento(resultado.data.id, imagensPayload);
      } catch (err: any) {
        setEditando(resultado.data);
        throw new Error(
          err?.message ||
          "O equipamento foi salvo, mas as fotos não puderam ser persistidas. Revise e tente novamente."
        );
      }

      if (!editando) {
        const liberadoEmail = await ensureSensitiveAccess({
          title: "Enviar ordem de entrada",
          description: "Informe o PIN para enviar a ordem de entrada por email ao cliente.",
          permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
        });
        if (liberadoEmail) {
          const equipamentoComEmail = {
            ...resultado.data,
            cliente_email: resultado.data.cliente_email || clienteVinculado.email || undefined,
          };
          const emailAtual = (equipamentoComEmail.cliente_email || "").trim();
          async function enviarOrdemEntrada(email: string) {
            const retornoEmailEntrada = await EmailService.enviarOrdemEntrada({
              ...resultado.data,
              cliente_email: email,
            } as Equipamento);
            if (!retornoEmailEntrada.sucesso) {
              showError("Equipamentos", "Enviar ordem de entrada", new Error(retornoEmailEntrada.erro || "Falha desconhecida."));
            } else {
              success("Equipamentos", "Email de ordem de entrada enviado com sucesso.", "Enviar email");
            }
          }
          setConfirmProps({
            title: "Envio por email",
            description: "Quer enviar a ordem de entrada automaticamente por email?",
            closeLabel: "Fechar",
            onClose: () => {},
            onConfirm: () => {
              if (emailAtual) {
                void enviarOrdemEntrada(emailAtual);
              } else {
                setInputProps({
                  title: "Envio por email",
                  description: "Este cliente não possui e-mail cadastrado. Informe um e-mail para enviar a ordem de entrada:",
                  label: "Email",
                  placeholder: "email@exemplo.com",
                  onConfirm: (value: string) => {
                    const email = value.trim();
                    if (!emailValido(email)) {
                      warning("Equipamentos", "O e-mail informado é inválido. O envio por e-mail será ignorado neste evento.");
                      return;
                    }
                    void enviarOrdemEntrada(email);
                  },
                });
                setInputOpen(true);
              }
            },
          });
          setConfirmOpen(true);
        }
      }

      setDialogOpen(false);
      setImagensFormulario([]);
      setErroImagens(null);
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      showError("Equipamentos", "Salvar equipamento", err);
    }
    finally { setSalvando(false); }
  }

  /** Confirma e executa exclusão do equipamento. Conecta-se a: useEquipamentos.deletar → db → Rust */
  async function onDelete() {
    if (!deletando) return;
    setSalvando(true);
    try { await deletar(deletando.id!); setDeleteDialogOpen(false); setDeletando(null); }
    catch (err) { console.error("Erro ao deletar:", err); }
    finally { setSalvando(false); }
  }

  async function solicitarExclusao(eq: Equipamento) {
    const liberado = await ensureSensitiveAccess({
      title: "Excluir equipamento",
      description: "Informe o PIN para excluir o equipamento, suas verificações e comunicações vinculadas.",
      permission: SENSITIVE_PERMISSIONS.DELETE_RECORDS,
    });
    if (!liberado) return;

    setDeletando(eq);
    setDeleteDialogOpen(true);
  }

  // ─── Automação: Finalizar Verificação ─────────────────

  /**
   * Callback do dialog de verificação. Dispara automação completa:
   * verificação → VERIFICADO → AGUARDANDO_APROVACAO + WhatsApp + Email.
   * Conecta-se a: useStatusEquipamento.finalizarVerificacao
   */
  async function handleConcluirVerificacao(dados: DadosVerificacao) {
    if (!selecionado) return;
    const liberado = await ensureSensitiveAccess({
      title: "Finalizar verificação",
      description: "Informe o PIN para salvar orçamento, prazo de aprovação e disparar comunicações automáticas.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) return;

    async function executarComEmail(email: string | undefined) {
      setSalvando(true);
      try {
        const resultado = await finalizarVerificacao(selecionado!, dados, email);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível finalizar a verificação.");
        }
        setVerificacaoDialogOpen(false);
        await recarregar();
        const resumoCanais = mensagemResultadoCanais(resultado);
        if (resumoCanais) {
          success("Equipamentos", resumoCanais, "Finalizar verificação");
        }
      } catch (err: any) {
        console.error("Erro ao finalizar verificação:", err);
        showError("Equipamentos", "Finalizar verificação", err);
      } finally {
        setSalvando(false);
      }
    }

    const emailAtual = (selecionado.cliente_email || "").trim();
    setConfirmProps({
      title: "Envio por email",
      description: "Quer enviar o orçamento automaticamente por email?",
      closeLabel: "Fechar",
      onClose: () => {},
      onConfirm: () => {
        if (!emailAtual) {
          setInputProps({
            title: "Envio por email",
            description: "Este cliente não possui e-mail cadastrado. Informe um e-mail para finalizar a verificação e enviar o orçamento:",
            label: "Email",
            placeholder: "email@exemplo.com",
            onConfirm: (value: string) => {
              const email = value.trim();
              if (!emailValido(email)) {
                warning("Equipamentos", "O e-mail informado é inválido. O envio por e-mail será ignorado neste evento.");
                return;
              }
              void executarComEmail(email);
            },
          });
          setInputOpen(true);
        } else {
          void executarComEmail(emailAtual);
        }
      },
      onCancel: () => {
        void executarComEmail(undefined);
      },
    });
    setConfirmOpen(true);
  }

  // ─── Automação: Marcar como Pronto ────────────────────

  /**
   * Marca equipamento como PRONTO e dispara notificações automáticas.
   * Conecta-se a: useStatusEquipamento.marcarComoPronto
   */
  async function handleMarcarPronto(eq: Equipamento) {
    const liberado = await ensureSensitiveAccess({
      title: "Marcar equipamento como pronto",
      description: "Informe o PIN para finalizar a etapa e disparar as comunicações automáticas.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) return;

    async function executarComEmail(email: string | undefined) {
      setSalvando(true);
      try {
        const resultado = await marcarComoPronto(eq, email);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível marcar o equipamento como pronto.");
        }
        await recarregar();
        const resumoCanais = mensagemResultadoCanais(resultado);
        if (resumoCanais) {
          success("Equipamentos", resumoCanais, "Marcar como pronto");
        }
      } catch (err: any) {
        console.error("Erro ao marcar pronto:", err);
        showError("Equipamentos", "Marcar como pronto", err);
      } finally {
        setSalvando(false);
      }
    }

    const emailAtual = (eq.cliente_email || "").trim();
    setConfirmProps({
      title: "Envio por email",
      description: "Quer avisar o cliente que o equipamento está pronto por email?",
      closeLabel: "Fechar",
      onClose: () => {},
      onConfirm: () => {
        if (!emailAtual) {
          setInputProps({
            title: "Envio por email",
            description: "Este cliente não possui e-mail cadastrado. Informe um e-mail para avisar que o equipamento está pronto para retirada:",
            label: "Email",
            placeholder: "email@exemplo.com",
            onConfirm: (value: string) => {
              const email = value.trim();
              if (!emailValido(email)) {
                warning("Equipamentos", "O e-mail informado é inválido. O envio por e-mail será ignorado neste evento.");
                return;
              }
              void executarComEmail(email);
            },
          });
          setInputOpen(true);
        } else {
          void executarComEmail(emailAtual);
        }
      },
      onCancel: () => {
        void executarComEmail(undefined);
      },
    });
    setConfirmOpen(true);
  }

  /** Confirma mudança manual de status com campos extras (valor, prazo, etc) */
  async function confirmarMudancaStatus() {
    if (!selecionado || !novoStatus) return;
    const precisaLiberacao = statusExigeAcessoSensivel(
      novoStatus,
      valorOrcamento || undefined,
      prazoAprovacao || undefined,
      valorFinal || undefined,
    );
    if (precisaLiberacao) {
      const liberado = await ensureSensitiveAccess({
        title: "Confirmar mudança de status",
        description: "Informe o PIN para aplicar esta transição e persistir dados sensíveis do equipamento.",
        permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
      });
      if (!liberado) return;
    }

    setSalvando(true);
    try {
      if (novoStatus === "ENTREGUE") {
        const imagensAtuais = await carregarImagensComPreview(selecionado.id!);
        const imagensEntradaPayload: EquipamentoImagemInput[] = normalizarOrdemPorCategoria(
          filtrarImagensPorCategoria(imagensAtuais, "ENTRADA")
        ).map(({ local_id, preview_url, ...imagem }) => imagem);
        const imagensSaidaPayload: EquipamentoImagemInput[] = normalizarOrdemPorCategoria(
          imagensSaidaEntrega
        ).map(({ local_id, preview_url, ...imagem }) => imagem);
        await db.substituirImagensEquipamento(selecionado.id!, [
          ...imagensEntradaPayload,
          ...imagensSaidaPayload,
        ]);
      }

      const resultado = await atualizarStatus(
        selecionado.id!,
        novoStatus,
        valorOrcamento || undefined,
        prazoAprovacao || undefined,
        valorFinal || undefined,
        selecionado.atualizado_em
      );
      if (!resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível alterar o status.");
      }
      setStatusDialogOpen(false);
      setImagensSaidaEntrega([]);
      setErroImagensSaidaEntrega(null);
    } catch (err: any) {
      console.error("Erro:", err);
      showError("Equipamentos", "Alterar status", err);
    }
    finally { setSalvando(false); }
  }

  // ─── Ações rápidas ────────────────────────────────────

  /** Muda status diretamente sem dialog (ex: RECEBIDO → EM_VERIFICACAO) */
  async function acaoRapida(eq: Equipamento, novoSt: string) {
    if (statusExigeAcessoSensivel(novoSt)) {
      const liberado = await ensureSensitiveAccess({
        title: "Alterar status",
        description: "Informe o PIN para executar esta transição sensível do equipamento.",
        permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
      });
      if (!liberado) return;
    }

    setSalvando(true);
    try {
      const resultado = await atualizarStatus(eq.id!, novoSt, undefined, undefined, undefined, eq.atualizado_em);
      if (!resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível aplicar a ação rápida.");
      }
    }
    catch (err: any) {
      console.error("Erro:", err);
      showError("Equipamentos", "Ação rápida", err);
    }
    finally { setSalvando(false); }
  }

  async function handleSelecionarImagensSaidaEntrega(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(event.target.files || []);
    event.target.value = "";
    if (arquivos.length === 0) return;

    const vagasRestantes = LIMITE_IMAGENS_POR_EQUIPAMENTO - imagensSaidaEntrega.length;
    if (vagasRestantes <= 0) {
      setErroImagensSaidaEntrega(`Limite de ${LIMITE_IMAGENS_POR_EQUIPAMENTO} fotos de saída já atingido.`);
      return;
    }

    const arquivosProcessados = arquivos.slice(0, vagasRestantes);
    setCarregandoImagensSaidaEntrega(true);
    try {
      const novasImagens = await Promise.all(
        arquivosProcessados.map((arquivo, index) =>
          arquivoParaImagemEquipamento(
            arquivo,
            imagensSaidaEntrega.length + index,
            "SAIDA",
          )
        )
      );

      setImagensSaidaEntrega((estadoAtual) =>
        normalizarOrdemPorCategoria([...estadoAtual, ...novasImagens])
      );
      setErroImagensSaidaEntrega(
        arquivos.length > arquivosProcessados.length
          ? `Somente ${LIMITE_IMAGENS_POR_EQUIPAMENTO} fotos de saída podem ser mantidas por equipamento.`
          : null
      );
    } catch (err: any) {
      console.error("Erro ao processar fotos de saída:", err);
      setErroImagensSaidaEntrega(err?.message || "Não foi possível processar as fotos de saída selecionadas.");
    } finally {
      setCarregandoImagensSaidaEntrega(false);
    }
  }

  function removerImagemSaidaEntrega(localId: string) {
    setImagensSaidaEntrega((estadoAtual) =>
      normalizarOrdemPorCategoria(estadoAtual.filter((imagem) => imagem.local_id !== localId))
    );
    setErroImagensSaidaEntrega(null);
  }

  function atualizarLegendaImagemSaidaEntrega(localId: string, value: string) {
    setImagensSaidaEntrega((estadoAtual) =>
      estadoAtual.map((imagem) => (
        imagem.local_id === localId
          ? { ...imagem, observacao: value.slice(0, 280) }
          : imagem
      ))
    );
  }

  async function exportarImagemEquipamento(imagem: EquipamentoImagemDraft) {
    try {
      const caminho = await invoke<string>("salvar_imagem_equipamento", {
        bytes: imagem.bytes,
        fileName: imagem.filename,
        mimeType: imagem.mime_type,
      });
      success("Equipamentos", `Imagem exportada com sucesso. Arquivo: ${caminho}`, "Exportar imagem");
    } catch (err: any) {
      console.error("Erro ao exportar imagem do equipamento:", err);
      showError("Equipamentos", "Exportar imagem", err);
    }
  }

  /** Envia orçamento manualmente via WhatsApp. Busca verificação do banco primeiro */
  async function enviarWhatsAppOrcamento(eq: Equipamento) {
    const liberado = await ensureSensitiveAccess({
      title: "Enviar orçamento por WhatsApp",
      description: "Informe o PIN para disparar manualmente a mensagem de orçamento ao cliente.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) return;

    const verif = await db.buscarVerificacao(eq.id!);
    if (!verif) { warning("Equipamentos", "Nenhuma verificação técnica encontrada para este equipamento."); return; }
    const r = await WhatsAppService.enviarOrcamento(eq, verif);
    if (!r.sucesso) {
      if (whatsappNaoConfigurado(r.erro)) {
        console.warn("[WhatsApp] Integração não configurada. Fluxo segue com envio manual de PDF.");
        return;
      }
      showError("Equipamentos", "Enviar WhatsApp", new Error(r.erro));
    }
  }

  /** Gera DOCX de orçamento preenchido e abre no Word */
  /** Gera PDF de orçamento preenchido e abre no leitor padrão */
  async function gerarOrcamentoPdf(eq: Equipamento) {
    try {
      setSalvando(true);
      const verif = await db.buscarVerificacao(eq.id!);
      if (!verif) { warning("Equipamentos", "Nenhuma verificação técnica encontrada para este equipamento."); return; }
      const caminho = await PdfService.gerarOrcamento(eq, verif);
      if (caminho) {
        success("Equipamentos", `Orçamento PDF gerado com sucesso. Arquivo: ${caminho}`, "Gerar PDF");
      }
    } catch (err) {
      console.error("Erro ao gerar orçamento PDF:", err);
      showError("Equipamentos", "Gerar orçamento PDF", err);
    } finally {
      setSalvando(false);
    }
  }

  /** Gera PDF da ordem de serviço para envio manual antes da verificação */
  async function gerarOrdemServicoPdf(eq: Equipamento) {
    try {
      setSalvando(true);
      const caminho = await PdfService.gerarOrdemServico(eq);
      if (caminho) {
        success("Equipamentos", `Ordem de Serviço PDF gerada com sucesso. Arquivo: ${caminho}`, "Gerar PDF");
      }
    } catch (err) {
      console.error("Erro ao gerar Ordem de Serviço PDF:", err);
      showError("Equipamentos", "Gerar Ordem de Serviço PDF", err);
    } finally {
      setSalvando(false);
    }
  }

  async function gerarRelatorioStatusPdf(eq: Equipamento) {
    try {
      setSalvando(true);
      const caminho = await PdfService.gerarRelatorioStatus(eq);
      if (caminho) {
        success("Equipamentos", `Relatório de Status gerado com sucesso. Arquivo: ${caminho}`, "Gerar PDF");
      }
    } catch (err) {
      console.error("Erro ao gerar Relatório de Status PDF:", err);
      showError("Equipamentos", "Gerar Relatório de Status PDF", err);
    } finally {
      setSalvando(false);
    }
  }

  /** Envia notificação de "pronto" manualmente via WhatsApp */
  async function enviarWhatsAppPronto(eq: Equipamento) {
    const liberado = await ensureSensitiveAccess({
      title: "Enviar aviso de equipamento pronto",
      description: "Informe o PIN para disparar manualmente a mensagem de retirada ao cliente.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) return;

    const r = await WhatsAppService.enviarEquipamentoPronto(eq);
    if (!r.sucesso) {
      if (whatsappNaoConfigurado(r.erro)) {
        console.warn("[WhatsApp] Integração não configurada. Fluxo segue sem envio automático.");
        return;
      }
      showError("Equipamentos", "Enviar WhatsApp", new Error(r.erro));
    }
  }

  // ─── Botões de ação contextuais por status ────────────

  /**
   * Renderiza botões de ação contextuais por status na tabela.
   * Cada status tem ações específicas (ex: RECEBIDO → "Iniciar Verificação").
   * Conecta-se a: acaoRapida, abrirVerificacao, abrirMudarStatus, handleMarcarPronto, WhatsApp
   */
  function renderAcoes(eq: Equipamento) {
    let primary: PriorityAction | null = null;
    let secondary: PriorityAction | undefined;
    const overflow: PriorityAction[] = [];
    const classeAcaoPrincipal = "min-w-[170px] justify-center";

    const acaoStatus: PriorityAction = {
      id: "status",
      label: "Status",
      icon: <Eye className="h-3.5 w-3.5" />,
      variant: "outline",
      onClick: () => void abrirDetalhes(eq),
    };
    const acaoEditar: PriorityAction = {
      id: "editar",
      label: "Editar",
      icon: <Edit className="h-3.5 w-3.5" />,
      variant: "outline",
      onClick: () => abrirEditar(eq),
    };
    const acaoExcluir: PriorityAction = {
      id: "excluir",
      label: "Excluir",
      icon: <Trash2 className="h-3.5 w-3.5" />,
      variant: "ghost",
      className: "text-red-600",
      onClick: () => void solicitarExclusao(eq),
    };

    switch (eq.status) {
      case "RECEBIDO":
        primary = {
          id: "iniciar_verificacao",
          label: "Iniciar Verificação",
          icon: <Play className="h-3.5 w-3.5" />,
          variant: "default",
          className: classeAcaoPrincipal,
          onClick: () => void acaoRapida(eq, "EM_VERIFICACAO"),
          disabled: salvando,
        };
        secondary = acaoStatus;
        overflow.push(
          {
            id: "os_pdf",
            label: "OS PDF",
            icon: <FileDown className="h-3.5 w-3.5" />,
            onClick: () => void gerarOrdemServicoPdf(eq),
            disabled: salvando,
          },
          acaoEditar,
          acaoExcluir
        );
        break;
      case "EM_VERIFICACAO":
        primary = {
          id: "abrir_verificacao",
          label: "Abrir Verificação",
          icon: <ClipboardCheck className="h-3.5 w-3.5" />,
          variant: "default",
          className: classeAcaoPrincipal,
          onClick: () => abrirVerificacao(eq),
        };
        secondary = acaoStatus;
        overflow.push(acaoEditar, acaoExcluir);
        break;
      case "VERIFICADO":
        primary = {
          id: "enviar_orcamento",
          label: "Enviar Orçamento",
          icon: <Send className="h-3.5 w-3.5" />,
          variant: "default",
          className: classeAcaoPrincipal,
          onClick: () => void abrirMudarStatus(eq, "AGUARDANDO_APROVACAO"),
        };
        secondary = acaoStatus;
        overflow.push(
          {
            id: "orcamento_pdf",
            label: "Orçamento PDF",
            icon: <FileDown className="h-3.5 w-3.5" />,
            onClick: () => void gerarOrcamentoPdf(eq),
            disabled: salvando,
          }
        );
        if (eq.cliente_telefone) {
          overflow.push({
            id: "whatsapp_orcamento",
            label: "WhatsApp",
            icon: <MessageSquare className="h-3.5 w-3.5" />,
            onClick: () => void enviarWhatsAppOrcamento(eq),
          });
        }
        overflow.push(acaoEditar, acaoExcluir);
        break;
      case "AGUARDANDO_APROVACAO":
        primary = {
          id: "aprovar",
          label: "Aprovar",
          icon: <CheckCircle className="h-3.5 w-3.5" />,
          variant: "default",
          className: "bg-green-600 hover:bg-green-700 text-white",
          onClick: () => void acaoRapida(eq, "APROVADO"),
          disabled: salvando,
        };
        secondary = {
          id: "ajustar_orcamento",
          label: "Ajustar Orçamento",
          icon: <RefreshCw className="h-3.5 w-3.5" />,
          variant: "outline",
          onClick: () => void abrirMudarStatus(eq, "AGUARDANDO_APROVACAO"),
        };
        overflow.push(
          {
            id: "reprovar",
            label: "Reprovar",
            icon: <XCircle className="h-3.5 w-3.5" />,
            className: "text-red-600",
            onClick: () => void acaoRapida(eq, "REPROVADO"),
            disabled: salvando,
          },
          {
            id: "orcamento_pdf",
            label: "Orçamento PDF",
            icon: <FileDown className="h-3.5 w-3.5" />,
            onClick: () => void gerarOrcamentoPdf(eq),
            disabled: salvando,
          }
        );
        if (eq.cliente_telefone) {
          overflow.push({
            id: "whatsapp_orcamento",
            label: "WhatsApp",
            icon: <MessageSquare className="h-3.5 w-3.5" />,
            onClick: () => void enviarWhatsAppOrcamento(eq),
          });
        }
        overflow.push(acaoStatus, acaoEditar, acaoExcluir);
        break;
      case "APROVADO":
        primary = {
          id: "iniciar_manutencao",
          label: "Iniciar Manutenção",
          icon: <Wrench className="h-3.5 w-3.5" />,
          variant: "default",
          className: classeAcaoPrincipal,
          onClick: () => void acaoRapida(eq, "EM_MANUTENCAO"),
          disabled: salvando,
        };
        secondary = acaoStatus;
        overflow.push(acaoEditar, acaoExcluir);
        break;
      case "EM_MANUTENCAO":
        primary = {
          id: "marcar_pronto",
          label: "Marcar Pronto",
          icon: <PackageCheck className="h-3.5 w-3.5" />,
          variant: "default",
          className: classeAcaoPrincipal,
          onClick: () => void handleMarcarPronto(eq),
          disabled: salvando || loadingAutomacao,
        };
        secondary = acaoStatus;
        overflow.push(acaoEditar, acaoExcluir);
        break;
      case "AGUARDANDO_PECA":
        primary = {
          id: "retomar_manutencao",
          label: "Retomar Manutenção",
          icon: <Wrench className="h-3.5 w-3.5" />,
          variant: "default",
          className: classeAcaoPrincipal,
          onClick: () => void acaoRapida(eq, "EM_MANUTENCAO"),
          disabled: salvando,
        };
        secondary = acaoStatus;
        overflow.push(acaoEditar, acaoExcluir);
        break;
      case "PRONTO":
        primary = {
          id: "registrar_entrega",
          label: "Registrar Entrega",
          icon: <PackageCheck className="h-3.5 w-3.5" />,
          variant: "default",
          className: classeAcaoPrincipal,
          onClick: () => void abrirMudarStatus(eq, "ENTREGUE"),
        };
        secondary = acaoStatus;
        if (eq.cliente_telefone) {
          overflow.push({
            id: "whatsapp_pronto",
            label: "WhatsApp",
            icon: <MessageSquare className="h-3.5 w-3.5" />,
            onClick: () => void enviarWhatsAppPronto(eq),
          });
        }
        overflow.push(acaoEditar, acaoExcluir);
        break;
      case "ORCAMENTO_VENCIDO":
        primary = {
          id: "ajustar_orcamento_vencido",
          label: "Ajustar Orçamento",
          icon: <RefreshCw className="h-3.5 w-3.5" />,
          variant: "default",
          className: classeAcaoPrincipal,
          onClick: () => void abrirMudarStatus(eq, "AGUARDANDO_APROVACAO"),
        };
        secondary = {
          id: "reenviar_orcamento",
          label: "Reenviar",
          icon: <Send className="h-3.5 w-3.5" />,
          variant: "outline",
          onClick: () => void abrirMudarStatus(eq, "AGUARDANDO_APROVACAO"),
        };
        overflow.push(acaoStatus, acaoEditar, acaoExcluir);
        break;
      default:
        primary = acaoStatus;
        secondary = undefined;
        if (getProximosStatus(eq.status).length > 0) {
          secondary = {
            id: "mudar_status",
            label: "Mudar Status",
            icon: <RefreshCw className="h-3.5 w-3.5" />,
            variant: "outline",
            onClick: () => void abrirMudarStatus(eq),
          };
        }
        overflow.push(acaoEditar, acaoExcluir);
        break;
    }

    return primary
      ? (
        <ActionPriorityRow
          primary={primary}
          iconOnlyPrimary={eq.status === "ENTREGUE" || eq.status === "ABANDONADO"}
          secondary={secondary}
          overflow={overflow}
          iconOnlySecondary
          iconOnlyOverflowTrigger
        />
      )
      : null;
  }

  // ─── Sub-renders para abas do drawer de detalhes ──────

  function renderVerificacaoTab() {
    if (carregandoDetalhes) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>;
    if (!verificacaoDetalhes) return <div className="text-center py-8 text-muted-foreground"><ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-20" /><p>Nenhuma verificação realizada</p></div>;

    const v = verificacaoDetalhes;
    const emailTecnico = EMAIL_POR_TECNICO[v.tecnico_nome] || "—";
    const itens: ItemVerificacao[] = v.itens_verificados ? JSON.parse(v.itens_verificados) : [];
    const servs: ServicoNecessario[] = v.servicos_necessarios ? JSON.parse(v.servicos_necessarios) : [];
    const pcs: PecaNecessaria[] = v.pecas_necessarias ? JSON.parse(v.pecas_necessarias) : [];

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-muted-foreground">Técnico:</span> <span className="font-medium ml-1">{v.tecnico_nome}</span></div>
          <div><span className="text-muted-foreground">E-mail técnico:</span> <span className="font-medium ml-1">{emailTecnico}</span></div>
          {v.tempo_estimado != null && <div><span className="text-muted-foreground">Tempo Est.:</span> <span className="font-medium ml-1">{v.tempo_estimado}h</span></div>}
        </div>
        <div className="text-sm"><p className="text-muted-foreground mb-1">Problema Relatado:</p><p className="bg-accent/50 p-2 rounded">{v.problema_relatado}</p></div>
        {v.diagnostico && <div className="text-sm"><p className="text-muted-foreground mb-1">Diagnóstico:</p><p className="bg-accent/50 p-2 rounded">{v.diagnostico}</p></div>}
        {itens.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Checklist</p>
            <div className="space-y-1">
              {itens.map(item => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  {item.verificado ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-400" />}
                  <span className={item.verificado ? "" : "text-muted-foreground"}>{item.nome}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {servs.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Serviços</p>
            <div className="space-y-1">{servs.map(s => (
              <div key={s.id} className="flex justify-between text-sm border-b pb-1"><span>{s.descricao}</span><span className="font-medium">R$ {s.valor.toFixed(2)}</span></div>
            ))}</div>
          </div>
        )}
        {pcs.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Peças</p>
            <div className="space-y-1">{pcs.map(p => (
              <div key={p.id} className="flex justify-between text-sm border-b pb-1"><span>{p.nome} (x{p.quantidade})</span><span className="font-medium">R$ {p.valorTotal.toFixed(2)}</span></div>
            ))}</div>
          </div>
        )}
        <Card><CardContent className="pt-4">
          <div className="flex justify-between text-sm"><span>Mão de obra:</span><span>R$ {(v.custo_estimado_mao_obra || 0).toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span>Peças:</span><span>R$ {(v.custo_estimado_pecas || 0).toFixed(2)}</span></div>
          <hr className="my-2" />
          <div className="flex justify-between font-bold"><span>Total:</span><span>R$ {(v.custo_total || 0).toFixed(2)}</span></div>
        </CardContent></Card>
        {v.observacoes && <div className="text-sm"><p className="text-muted-foreground">Obs:</p><p>{v.observacoes}</p></div>}
      </div>
    );
  }

  function renderHistoricoTab() {
    if (!selecionado) return null;
    const eq = selecionado;
    const eventos: { label: string; data: string; status: string }[] = [];
    if (eq.data_entrada) eventos.push({ label: "Recebido", data: eq.data_entrada, status: "RECEBIDO" });
    if (eq.data_verificacao) eventos.push({ label: "Verificado", data: eq.data_verificacao, status: "VERIFICADO" });
    if (eq.data_aprovacao) eventos.push({ label: "Aprovado", data: eq.data_aprovacao, status: "APROVADO" });
    if (eq.data_reprovacao) eventos.push({ label: "Reprovado", data: eq.data_reprovacao, status: "REPROVADO" });
    if (eq.data_pronto) eventos.push({ label: "Pronto", data: eq.data_pronto, status: "PRONTO" });
    if (eq.data_saida) eventos.push({ label: "Entregue", data: eq.data_saida, status: "ENTREGUE" });
    eventos.sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    if (eventos.length === 0) return <div className="text-center py-8 text-muted-foreground"><History className="h-10 w-10 mx-auto mb-2 opacity-20" /><p>Nenhum registro de histórico</p></div>;

    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => void gerarRelatorioStatusPdf(eq)}
            disabled={salvando}
          >
            <FileDown className="h-3.5 w-3.5" />
            Gerar Relatório de Status
          </Button>
        </div>
        <div className="space-y-0">
        {eventos.map((ev, idx) => (
          <div key={ev.label} className="flex items-start gap-3 pb-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full mt-1 ${idx === eventos.length - 1 ? "bg-blue-500 ring-2 ring-blue-200" : "bg-gray-300"}`} />
              {idx < eventos.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1 min-h-[16px]" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={ev.status} />
                <span className="text-xs text-muted-foreground">{new Date(ev.data).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
          </div>
        ))}
        <div className="mt-2 p-2 bg-accent/50 rounded text-sm flex items-center gap-2">
          <span className="text-muted-foreground">Status atual:</span>
          <StatusBadge status={eq.status} />
        </div>
        </div>
      </div>
    );
  }

  // ─── Render principal ─────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Equipamentos</h1>
          <p className="text-muted-foreground">Gerencie equipamentos, verificações e orçamentos</p>
        </div>
        <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Novo Equipamento</Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por série, marca, modelo, cliente..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="w-full sm:w-56">
                <Filter className="h-4 w-4 mr-2" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(opt => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={recarregar}><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>
          ) : equipamentos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Printer className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-1">Nenhum equipamento encontrado</p>
              <p className="text-sm">{busca || statusFiltro !== "TODOS" ? "Tente ajustar os filtros" : "Clique em 'Novo Equipamento' para cadastrar"}</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº Série</TableHead>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipamentos.map(eq => (
                    <TableRow key={eq.id}>
                      <TableCell className="font-mono font-medium">{eq.serial_number}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{eq.marca} {eq.modelo}</span>
                          <p className="text-xs text-muted-foreground">{eq.tipo}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {eq.cliente_nome ? (
                          <div>
                            <span className="text-sm">{eq.cliente_nome}</span>
                            {eq.cliente_telefone && <p className="text-xs text-muted-foreground">{eq.cliente_telefone}</p>}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={eq.status} />
                          {(eq.status === "AGUARDANDO_APROVACAO" || eq.status === "ORCAMENTO_VENCIDO") &&
                            eq.valor_orcamento != null && eq.valor_orcamento > 0 && (
                              <div className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                                Orçamento: R$ {eq.valor_orcamento.toFixed(2)}
                              </div>
                            )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {eq.data_entrada ? new Date(eq.data_entrada).toLocaleDateString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          {renderAcoes(eq)}
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

      {/* ═══ Dialog Criar/Editar ═══ */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) { setRegistrosAnteriores([]); setConfirmouNovoCiclo(false); }
        setDialogOpen(open);
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* ── Cliente ── */}
            <div className="space-y-2">
              <ClienteSelector
                clienteInicial={clienteVinculado}
                onClienteSelecionado={(c) => { setClienteVinculado(c); setErroCliente(null); }}
                onClienteRemovido={() => setClienteVinculado(null)}
                readOnly={false}
              />
              {erroCliente && (
                <ErrorAlert variant="error" context="Equipamentos" message={erroCliente} />
              )}
            </div>
            <hr />
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Printer className="h-4 w-4" /><h3 className="font-semibold text-sm">Dados do Equipamento</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nº Série *</Label>
                  <Input
                    {...form.register("serial_number")}
                    onBlur={(e) => {
                      void form.register("serial_number").onBlur(e);
                      void handleSerialBlur();
                    }}
                  />
                  <FormValidationError message={form.formState.errors.serial_number?.message} />
                  {registrosAnteriores.length > 0 && (
                    <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-sm font-medium text-amber-800">
                        ⚠️ Este número de série já possui {registrosAnteriores.length} registro{registrosAnteriores.length > 1 ? 's' : ''} anterior{registrosAnteriores.length > 1 ? 'es' : ''}:
                      </p>
                      <ul className="space-y-1">
                        {registrosAnteriores.map((r) => (
                          <li key={r.id} className="text-xs text-amber-700 flex items-center gap-1 flex-wrap">
                            <span>• #{r.id}</span>
                            <StatusBadge status={r.status} />
                            <span>— Entrada: {r.data_entrada ? new Date(r.data_entrada).toLocaleDateString("pt-BR") : "—"}</span>
                            {r.data_saida && (
                              <span>| Saída: {new Date(r.data_saida).toLocaleDateString("pt-BR")}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={confirmouNovoCiclo}
                          onChange={(e) => setConfirmouNovoCiclo(e.target.checked)}
                          className="rounded border-amber-300"
                        />
                        <span className="text-amber-800">Este equipamento já possui registro anterior. Desejo criar um novo ciclo de manutenção?</span>
                      </label>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Patrimônio</Label>
                  <Input {...form.register("patrimonio")} placeholder="Código patrimonial, se houver" />
                  <FormValidationError message={form.formState.errors.patrimonio?.message} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Marca *</Label>
                  <Input {...form.register("marca")} placeholder="Zebra, Datacard" />
                  <FormValidationError message={form.formState.errors.marca?.message} />
                </div>
                <div className="space-y-2">
                  <Label>Modelo do equipamento</Label>
                  <Input {...form.register("modelo")} placeholder="ZD421, GC420T" />
                  <FormValidationError message={form.formState.errors.modelo?.message} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo *</Label>
                  <Controller control={form.control} name="tipo" render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>{TIPO_OPTIONS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  )} />
                  <FormValidationError message={form.formState.errors.tipo?.message} />
                </div>
                <div className="space-y-2">
                  <Label>Defeito *</Label>
                  <Textarea {...form.register("defeito_relatado")} placeholder="Defeito informado no recebimento" rows={3} />
                  <FormValidationError message={form.formState.errors.defeito_relatado?.message} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Técnico (verificação inicial)</Label>
                  <Select
                    value={tecnicoNovoEquipamento}
                    onValueChange={(value: TecnicoDisponivel) => setTecnicoNovoEquipamento(value)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {TECNICOS_DISPONIVEIS.map((tecnico) => (
                        <SelectItem key={tecnico} value={tecnico}>{tecnico}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Acessórios</Label>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" value="Cabo de Força" {...form.register("acessorios")} />
                      Cabo de Força
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" value="Fonte" {...form.register("acessorios")} />
                      Fonte
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" value="Etiqueta" {...form.register("acessorios")} />
                      Etiqueta
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" value="Ribbon" {...form.register("acessorios")} />
                      Ribbon
                    </label>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" value="Cabo USB" {...form.register("acessorios")} />
                      Cabo USB
                    </label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Outros Acessórios</Label>
                  <Textarea {...form.register("acessorios_outros")} placeholder="Descreva itens fora do comum ou detalhes adicionais" rows={4} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea {...form.register("observacoes")} placeholder="Detalhe o estado físico, inclusive se o equipamento já chegou quebrado" rows={3} />
              </div>
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-medium">Registro fotográfico do equipamento</p>
                    <p className="text-xs text-muted-foreground">
                      Até {LIMITE_IMAGENS_POR_EQUIPAMENTO} imagens no total, com legenda opcional por foto.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {imagensFormulario.length}/{LIMITE_IMAGENS_POR_EQUIPAMENTO}
                  </span>
                </div>
                {erroImagens && <ErrorAlert variant="error" context="Equipamentos" message={erroImagens} />}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3 rounded-lg border p-3">
                       <div className="flex items-center justify-between gap-2">
                         <div>
                           <Label htmlFor="equipamento-imagens-entrada">Fotos da entrada</Label>
                           <p className="text-xs text-muted-foreground">Use para registrar avarias e estado no recebimento.</p>
                         </div>
                         <div className="flex items-center gap-1">
                           <Button
                             type="button"
                             variant="outline"
                             size="sm"
                             asChild
                             disabled={
                               salvando ||
                               carregandoImagensFormulario ||
                               imagensFormulario.length >= LIMITE_IMAGENS_POR_EQUIPAMENTO
                             }
                           >
                             <label htmlFor="equipamento-imagens-entrada" className="cursor-pointer">
                               <ImagePlus className="h-4 w-4" />Adicionar
                             </label>
                           </Button>
                           <Button
                             type="button"
                             variant="ghost"
                             size="icon"
                             className="h-6 w-6"
                             disabled={
                               salvando ||
                               carregandoImagensFormulario ||
                               imagensFormulario.length >= LIMITE_IMAGENS_POR_EQUIPAMENTO
                             }
                             onClick={() => {
                               setPhotoUploadCategoria("ENTRADA");
                               setPhotoUploadNewEquip(true);
                               setPhotoUploadOpen(true);
                             }}
                           >
                             <Smartphone className="h-3.5 w-3.5" />
                           </Button>
                         </div>
                       </div>
                    <input
                      id="equipamento-imagens-entrada"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => void handleSelecionarImagens(event, "ENTRADA")}
                      disabled={
                        salvando ||
                        carregandoImagensFormulario ||
                        imagensFormulario.length >= LIMITE_IMAGENS_POR_EQUIPAMENTO
                      }
                    />
                    {carregandoImagensFormulario ? (
                      <div className="flex items-center justify-center rounded-lg border border-dashed p-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                      </div>
                    ) : (
                      <GaleriaImagensEquipamento
                        imagens={filtrarImagensPorCategoria(imagensFormulario, "ENTRADA")}
                        mensagemVazia="Nenhuma foto cadastrada para registrar o estado de entrada deste equipamento."
                        onRemover={removerImagemFormulario}
                        onLegendaChange={atualizarLegendaImagem}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" type="button">Cancelar</Button></DialogClose>
              <Button type="submit" disabled={salvando || (registrosAnteriores.length > 0 && !confirmouNovoCiclo)}>
                {salvando ? "Salvando..." : registrosAnteriores.length > 0 ? "Criar novo ciclo" : editando ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog Detalhes com Abas ═══ */}
      <Dialog open={detalhesDialogOpen} onOpenChange={setDetalhesDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Detalhes do Equipamento</DialogTitle></DialogHeader>
          {selecionado && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">{selecionado.marca} {selecionado.modelo}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{selecionado.serial_number}</p>
                </div>
                <StatusBadge status={selecionado.status} />
              </div>

              <Tabs defaultValue="info">
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="info"><FileText className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Informações</TabsTrigger>
                  <TabsTrigger value="verificacao"><ClipboardCheck className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Verificação</TabsTrigger>
                  <TabsTrigger value="comunicacoes"><MessageSquare className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Comunicações</TabsTrigger>
                  <TabsTrigger value="historico"><History className="h-3.5 w-3.5 mr-1 hidden sm:inline" />Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Tipo:</span> <span className="ml-1 font-medium">{selecionado.tipo}</span></div>
                    <div><span className="text-muted-foreground">Entrada:</span> <span className="ml-1 font-medium">{selecionado.data_entrada ? new Date(selecionado.data_entrada).toLocaleDateString("pt-BR") : "—"}</span></div>
                    <div><span className="text-muted-foreground">Patrimônio:</span> <span className="ml-1 font-medium">{selecionado.patrimonio || "—"}</span></div>
                    <div><span className="text-muted-foreground">Nº Série:</span> <span className="ml-1 font-medium font-mono">{selecionado.serial_number}</span></div>
                  </div>
                  {selecionado.defeito_relatado && <div className="text-sm"><p className="text-muted-foreground mb-1">Defeito na entrada:</p><p className="bg-accent/50 p-2 rounded whitespace-pre-wrap">{selecionado.defeito_relatado}</p></div>}
                  {selecionado.acessorios && <div className="text-sm"><p className="text-muted-foreground mb-1">Acessórios:</p><p className="bg-accent/50 p-2 rounded">{selecionado.acessorios}</p></div>}
                  {selecionado.acessorios_outros && <div className="text-sm"><p className="text-muted-foreground mb-1">Outros Acessórios:</p><p className="bg-accent/50 p-2 rounded whitespace-pre-wrap">{selecionado.acessorios_outros}</p></div>}
                  {selecionado.observacoes && <div className="text-sm"><p className="text-muted-foreground mb-1">Observação física:</p><p className="bg-accent/50 p-2 rounded whitespace-pre-wrap">{selecionado.observacoes}</p></div>}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Fotos da entrada</p>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">
                            {filtrarImagensPorCategoria(imagensDetalhes, "ENTRADA").length} registrada(s)
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setPhotoUploadCategoria("ENTRADA");
                              setPhotoUploadOpen(true);
                            }}
                          >
                            <Smartphone className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {carregandoDetalhes ? (
                        <div className="flex items-center justify-center rounded-lg border border-dashed p-6">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                        </div>
                      ) : (
                        <GaleriaImagensEquipamento
                          imagens={filtrarImagensPorCategoria(imagensDetalhes, "ENTRADA")}
                          mensagemVazia="Nenhuma foto de entrada foi registrada para este equipamento."
                          onVisualizar={setImagemExpandida}
                          onExportar={(imagem) => void exportarImagemEquipamento(imagem)}
                        />
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Fotos da saída</p>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">
                            {filtrarImagensPorCategoria(imagensDetalhes, "SAIDA").length} registrada(s)
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setPhotoUploadCategoria("SAIDA");
                              setPhotoUploadOpen(true);
                            }}
                          >
                            <Smartphone className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      {carregandoDetalhes ? (
                        <div className="flex items-center justify-center rounded-lg border border-dashed p-6">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                        </div>
                      ) : (
                        <GaleriaImagensEquipamento
                          imagens={filtrarImagensPorCategoria(imagensDetalhes, "SAIDA")}
                          mensagemVazia="Nenhuma foto de saída foi registrada para este equipamento."
                          onVisualizar={setImagemExpandida}
                          onExportar={(imagem) => void exportarImagemEquipamento(imagem)}
                        />
                      )}
                    </div>
                  </div>
                  {selecionado.cliente_nome && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-1"><Users className="h-4 w-4" />Cliente</CardTitle></CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <p><strong>{selecionado.cliente_nome}</strong></p>
                        {selecionado.cliente_telefone && <p>Tel: {selecionado.cliente_telefone}</p>}
                        {selecionado.cliente_email && <p>Email: {selecionado.cliente_email}</p>}
                      </CardContent>
                    </Card>
                  )}
                  {selecionado.valor_orcamento != null && (
                    <Card>
                      <CardHeader className="py-3"><CardTitle className="text-sm">Orçamento</CardTitle></CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <p>Valor: <strong>R$ {selecionado.valor_orcamento?.toFixed(2)}</strong></p>
                        {selecionado.prazo_aprovacao && <p>Prazo: {new Date(selecionado.prazo_aprovacao).toLocaleDateString("pt-BR")}</p>}
                        {selecionado.valor_final != null && <p>Valor final: <strong>R$ {selecionado.valor_final.toFixed(2)}</strong></p>}
                        <Button variant="outline" size="sm" className="mt-2 gap-1" onClick={() => gerarOrcamentoPdf(selecionado)} disabled={salvando}>
                          <FileDown className="h-3.5 w-3.5" />Gerar Orçamento PDF
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                  {selecionado.observacoes && <div><p className="text-sm text-muted-foreground">Observações:</p><p className="text-sm mt-1 bg-accent/50 p-2 rounded">{selecionado.observacoes}</p></div>}
                  <DocumentosEquipamento equipamento={selecionado} />
                </TabsContent>

                <TabsContent value="verificacao" className="mt-4">{renderVerificacaoTab()}</TabsContent>

                {/* Comunicações — agora usa componente extraído */}
                <TabsContent value="comunicacoes" className="mt-4">
                  {carregandoDetalhes ? (
                    <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" /></div>
                  ) : (
                    <HistoricoComunicacoes
                      equipamentoId={selecionado.id!}
                      comunicacoesExternas={comunicacoes}
                    />
                  )}
                </TabsContent>

                <TabsContent value="historico" className="mt-4">{renderHistoricoTab()}</TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog Verificação Técnica (componente extraído) ═══ */}
      <VerificacaoTecnica
        equipamento={selecionado}
        open={verificacaoDialogOpen}
        onOpenChange={setVerificacaoDialogOpen}
        onConcluir={handleConcluirVerificacao}
        salvando={salvando || loadingAutomacao}
        tecnicoInicial={extrairTecnicoInicialDeObservacoes(selecionado?.observacoes || "") || "Ivan"}
      />

      {/* ═══ Dialog Mudar Status ═══ */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {novoStatus === "AGUARDANDO_APROVACAO" ? "Ajuste de Orçamento" : "Alterar Status"}
            </DialogTitle>
          </DialogHeader>
          {selecionado && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Atual:</span>
                <StatusBadge status={selecionado.status} />
              </div>
              {novoStatus ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Novo:</span>
                  <StatusBadge status={novoStatus} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Novo Status *</Label>
                  <Select value={novoStatus} onValueChange={handleNovoStatusChange}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {getProximosStatus(selecionado.status).map(s => (
                        <SelectItem key={s} value={s}>{STATUS_LABELS[s as StatusEquipamento] || s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {novoStatus === "AGUARDANDO_APROVACAO" && (
                <>
                  <div className="rounded-md border bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Revise o valor e o prazo para reenviar o orçamento atualizado ao cliente.
                  </div>
                  {(valorOrcamentoOriginal != null || valorOrcamentoAnterior != null) && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground">Valor original (verificação)</p>
                        <p className="font-semibold">
                          {valorOrcamentoOriginal != null ? `R$ ${valorOrcamentoOriginal.toFixed(2)}` : "—"}
                        </p>
                      </div>
                      <div className="rounded-md border bg-blue-50 px-3 py-2 text-sm text-blue-900">
                        <p className="text-xs text-blue-700">Valor atual antes do ajuste</p>
                        <p className="font-semibold">
                          {valorOrcamentoAnterior != null ? `R$ ${valorOrcamentoAnterior.toFixed(2)}` : "—"}
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2"><Label>Valor Orçamento (R$)</Label><Input type="number" step="0.01" value={valorOrcamento || ""} onChange={e => setValorOrcamento(Number(e.target.value))} /></div>
                  <div className="space-y-2"><Label>Prazo Aprovação</Label><Input type="date" value={prazoAprovacao} onChange={e => setPrazoAprovacao(e.target.value)} /></div>
                  {valorOrcamentoAnterior != null && valorOrcamento !== valorOrcamentoAnterior && (
                    <p className="text-xs text-amber-700">
                      Novo valor em negociação: R$ {valorOrcamento.toFixed(2)} (antes: R$ {valorOrcamentoAnterior.toFixed(2)}).
                    </p>
                  )}
                </>
              )}
              {novoStatus === "ENTREGUE" && (
                <div className="space-y-3">
                  <div className="rounded-md border bg-accent/40 px-3 py-2 text-sm">
                    Valor padrão de entrega (verificação técnica):{" "}
                    <strong>
                      R$ {(valorFinalSugerido ?? valorFinal ?? 0).toFixed(2)}
                    </strong>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={acordoExcecaoEntrega}
                      onChange={(e) => setAcordoExcecaoEntrega(e.target.checked)}
                    />
                    Acordo excepcional (usar valor diferente do verificado)
                  </label>
                  <div className="space-y-2">
                    <Label>Valor Final Pago (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={valorFinal || ""}
                      onChange={e => setValorFinal(Number(e.target.value))}
                      disabled={!acordoExcecaoEntrega}
                    />
                  </div>
                  {acordoExcecaoEntrega && valorFinalSugerido != null && valorFinal !== valorFinalSugerido && (
                    <p className="text-xs text-amber-600">
                      Exceção registrada: valor diferente da verificação técnica.
                    </p>
                  )}
                  <div className="space-y-3 rounded-lg border p-3">
                     <div className="flex items-center justify-between gap-2">
                       <div>
                         <Label htmlFor="equipamento-imagens-saida-entrega">Foto da saída (entrega)</Label>
                         <p className="text-xs text-muted-foreground">
                           Registre o estado final do equipamento no momento da entrega.
                         </p>
                       </div>
                       <div className="flex items-center gap-1">
                         <Button
                           type="button"
                           variant="outline"
                           size="sm"
                           asChild
                           disabled={
                             salvando ||
                             carregandoImagensSaidaEntrega ||
                             imagensSaidaEntrega.length >= LIMITE_IMAGENS_POR_EQUIPAMENTO
                           }
                         >
                           <label htmlFor="equipamento-imagens-saida-entrega" className="cursor-pointer">
                             <ImagePlus className="h-4 w-4" />Adicionar
                           </label>
                         </Button>
                         <Button
                           type="button"
                           variant="ghost"
                           size="icon"
                           className="h-6 w-6"
                           disabled={
                             salvando ||
                             carregandoImagensSaidaEntrega ||
                             imagensSaidaEntrega.length >= LIMITE_IMAGENS_POR_EQUIPAMENTO
                           }
                           onClick={() => {
                             setPhotoUploadCategoria("SAIDA");
                             setPhotoUploadNewEquip(false);
                             setPhotoUploadOpen(true);
                           }}
                         >
                           <Smartphone className="h-3.5 w-3.5" />
                         </Button>
                       </div>
                     </div>
                    {erroImagensSaidaEntrega && (
                      <p className="text-xs text-red-500">{erroImagensSaidaEntrega}</p>
                    )}
                    <input
                      id="equipamento-imagens-saida-entrega"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(event) => void handleSelecionarImagensSaidaEntrega(event)}
                      disabled={
                        salvando ||
                        carregandoImagensSaidaEntrega ||
                        imagensSaidaEntrega.length >= LIMITE_IMAGENS_POR_EQUIPAMENTO
                      }
                    />
                    {carregandoImagensSaidaEntrega ? (
                      <div className="flex items-center justify-center rounded-lg border border-dashed p-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                      </div>
                    ) : (
                      <GaleriaImagensEquipamento
                        imagens={imagensSaidaEntrega}
                        mensagemVazia="Nenhuma foto de saída registrada para esta entrega."
                        onRemover={removerImagemSaidaEntrega}
                        onLegendaChange={atualizarLegendaImagemSaidaEntrega}
                      />
                    )}
                  </div>
                </div>
              )}
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
                <Button onClick={confirmarMudancaStatus} disabled={salvando || !novoStatus}>
                  {salvando ? "Salvando..." : "Confirmar"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ═══ Dialog Exclusão ═══ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Confirmar Exclusão</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">Excluir <strong>{deletando?.marca} {deletando?.modelo}</strong> (SN: {deletando?.serial_number})?</p>
          <p className="text-sm text-red-500">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button variant="destructive" onClick={onDelete} disabled={salvando}>{salvando ? "Excluindo..." : "Excluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(imagemExpandida)} onOpenChange={(open) => { if (!open) setImagemExpandida(null); }}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Visualização da imagem</DialogTitle>
          </DialogHeader>
          {imagemExpandida && (
            <div className="space-y-3">
              <div className="max-h-[70vh] overflow-auto rounded-lg border bg-muted/20 p-2">
                <img
                  src={imagemExpandida.preview_url}
                  alt={imagemExpandida.filename}
                  className="mx-auto h-auto max-h-[65vh] w-auto rounded"
                />
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{imagemExpandida.filename}</span>
                <Button variant="outline" size="sm" className="gap-1" onClick={() => void exportarImagemEquipamento(imagemExpandida)}>
                  <Download className="h-3.5 w-3.5" />Exportar imagem
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmProps.title}
        description={confirmProps.description}
        variant={confirmProps.variant}
        closeLabel={confirmProps.closeLabel}
        onConfirm={() => {
          confirmProps.onConfirm();
          setConfirmOpen(false);
        }}
        onCancel={confirmProps.onCancel}
        onClose={confirmProps.onClose}
      />

      <InputDialog
        open={inputOpen}
        onOpenChange={setInputOpen}
        title={inputProps.title}
        description={inputProps.description}
        label={inputProps.label}
        placeholder={inputProps.placeholder}
        onConfirm={inputProps.onConfirm}
      />

      <PhotoUploadDialog
        equipamentoId={photoUploadNewEquip ? 0 : (selecionado?.id ?? 0)}
        categoria={photoUploadCategoria}
        open={photoUploadOpen}
        onOpenChange={setPhotoUploadOpen}
        onPhotoUploaded={async () => {
          if (selecionado?.id) {
            const imagens = await carregarImagensComPreview(selecionado.id);
            setImagensDetalhes(imagens);
          }
        }}
        onPhotoData={photoUploadNewEquip ? async (data) => {
          const previewUrl = await bytesParaDataUrl(data.bytes, data.mime_type);
          const nextOrdem = imagensFormulario
            .filter((img) => img.categoria === data.categoria)
            .reduce((max, img) => Math.max(max, img.ordem), -1) + 1;
          const draft: EquipamentoImagemDraft = {
            local_id: crypto.randomUUID?.() || `imagem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            categoria: data.categoria as EquipamentoImagemCategoria,
            filename: data.filename,
            mime_type: data.mime_type,
            tamanho_bytes: data.bytes.length,
            ordem: nextOrdem,
            bytes: data.bytes,
            preview_url: previewUrl,
          };
          setImagensFormulario((prev) => [...prev, draft]);
        } : undefined}
      />
    </div>
  );
}
