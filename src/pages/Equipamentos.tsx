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
import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Printer,
  Plus,
  Search,
  ArrowDownUp,
  X,
  Edit,
  Trash2,
  RefreshCw,
  RotateCcw,
  MessageSquare,
  ClipboardCheck,
  Play,
  CheckCircle,
  XCircle,
  Wrench,
  PackageCheck,
  History,
  Send,
  FileDown,
  ImagePlus,
  Eye,
  Download,
  Smartphone,
  DollarSign,
  ChevronLeft,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
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
  DialogDescription,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogBody,
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
import { PdfService, PRAZO_EXECUCAO_PADRAO, type PdfArtifact } from "@/lib/pdf-service";
import { FormValidationError } from "@/components/ui/form-validation-error";
import { db } from "@/lib/db";
import { formatDatePtBr, todayLocalIsoDate } from "@/lib/date-utils";
import {
  STATUS_LABELS,
  SENSITIVE_PERMISSIONS,
  type Equipamento,
  type EquipamentoHistoricoEvento,
  type EquipamentoImagemCategoria,
  type EquipamentoImagemInput,
  type Cliente,
  type ClienteContato,
  type FormaPagamento,
  type FormaPagamentoCodigo,
  type StatusEquipamento,
  type ItemVerificacao,
  type ServicoNecessario,
  type ServicoCatalogo,
  type PecaNecessaria,
  type Produto,
  type ConsumoOrcamento,
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
import { ContatoResponsavelSelector } from "@/components/equipamentos/ContatoResponsavelSelector";
import { EnvioManualOrcamentoDialog } from "@/components/equipamentos/EnvioManualOrcamentoDialog";
import { QuemRecebeOrcamentoDialog } from "@/components/equipamentos/QuemRecebeOrcamentoDialog";
import { enviarOrcamentoAoCliente, gerarNovaSenhaEnvioManual, prorrogarEEnviar, sugerirNovoPrazo } from "@/lib/envio-orcamento";
import { ehErroPrazoVencido, formatarDataIso } from "@/lib/orcamento-prazo";
import { CommunicationEmailDialog } from "@/components/equipamentos/CommunicationEmailDialog";
import { PhotoUploadDialog } from "@/components/equipamentos/PhotoUploadDialog";
import { DocumentosEquipamento } from "@/components/equipamentos/DocumentosEquipamento";
import { PdfPreviewDialog } from "@/components/equipamentos/PdfPreviewDialog";
import { publicarPdfOficial } from "@/lib/portal-documentos";
import { AjusteOrcamentoServicos } from "@/components/equipamentos/AjusteOrcamentoServicos";
import { carregarProdutosOrcamento, LABEL_CONFIRMAR_OS_GARANTIA, MENSAGEM_CONFIRMAR_OS_GARANTIA, normalizarServicosOrcamento, orcamentoEmElaboracao, transicaoElaboraOrcamento, osSomenteGarantia, pecasParaOrcamento, orcamentoJaAprovado, orcamentoMudou, resumirPecas, TITULO_CONFIRMAR_OS_GARANTIA, vaiAutoAprovarOsGarantia, validarPecas } from "@/lib/orcamento-estoque";
import { ActionPriorityRow, type PriorityAction } from "@/components/ui/action-priority-row";
import {
  arquivoParaImagemEquipamento,
  bytesParaDataUrl,
  imagemPersistidaParaDraft,
  imagensPersistidasIguais,
  LIMITE_IMAGENS_POR_EQUIPAMENTO,
  normalizarOrdemPorCategoria,
  type EquipamentoImagemDraft,
} from "@/lib/equipamento-imagem-utils";
import {
  MARCA_EQUIPAMENTO_OPTIONS,
  STATUS_COM_ORCAMENTO,
  FILTRO_STATUS_OUTROS,
  FILTRO_STATUS_PRINCIPAIS,
  TIPO_OPTIONS,
} from "@/pages/equipamentos/equipamentos-page-constants";
import { GaleriaImagensEquipamento } from "@/pages/equipamentos/EquipamentosPageGallery";
import { StatusBadge } from "@/pages/equipamentos/EquipamentosStatusBadge";
import { AnteriorEmAtendimentoAviso } from "@/components/equipamentos/AnteriorEmAtendimentoAviso";
import {
  MENSAGEM_DADOS_PREENCHIDOS,
  usarEquipamentoAnteriorNoCadastro,
} from "@/pages/equipamentos/equipamento-anterior";
import {
  agruparAcoesOs,
  extrairTecnicoInicialDeObservacoes,
  filtrarImagensPorCategoria,
  getStatusCorrecao,
  getProximosStatus,
  mensagemResultadoCanais,
  precisaPerguntarQuemRecebeOrcamento,
  reabreOrcamentoSemAjuste,
  removerTecnicoInicialDasObservacoes,
  statusExigeAcessoSensivel,
  mensagemAjusteTotalZero,
  totalOrcamentoAjusteValido,
  totalOrcamentoAprovacaoValido,
  whatsappNaoConfigurado,
} from "@/pages/equipamentos/equipamentos-page-utils";
import { DateIsoInput } from "@/components/ui/date-iso-input";
import { ValorDecimalInput } from "@/components/ui/valor-decimal-input";
import { formatCurrency, formatCurrencyOrMissing } from "@/lib/utils";
import { useNotification } from "@/hooks/useNotification";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { InputDialog } from "@/components/ui/input-dialog";
import { ErrorAlert } from "@/components/ui/error-alert";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { PagamentoOrcamentoDialog } from "@/components/equipamentos/PagamentoOrcamentoDialog";
import { DecisaoOrcamentoCard } from "@/components/equipamentos/DecisaoOrcamentoCard";
import { PortalClienteBotao } from "@/components/equipamentos/PortalClienteBotao";
import { PortalClienteProvider } from "@/components/equipamentos/portal-cliente-context";
import { EVENTO_ALERTAS_PORTAL } from "@/components/PortalAlertas";
import { toast } from "sonner";

const AVISO_ATENDIMENTO_PENDENTE = "abrir-atendimento-pendente";
import { CorrigirDecisaoDialog } from "@/components/equipamentos/CorrigirDecisaoDialog";
import { ReabrirOrcamentoDialog } from "@/components/equipamentos/ReabrirOrcamentoDialog";
import { EscolhaAjusteOrcamentoDialog } from "@/components/equipamentos/EscolhaAjusteOrcamentoDialog";
import type { AnaliseAjusteOrcamento, EnvioManualOrcamento, OpcoesAjusteOrcamento, PortalAjusteInfo, PreparoAcessoPortal } from "@/types";
import { FormaPagamentoFields } from "@/components/equipamentos/FormaPagamentoFields";
import { resolveRecipient, type ResolvedRecipient } from "@/lib/recipient-resolver";
import { mensagemEnvioFalhouComEmailSalvo, saveRecipientAddress } from "@/lib/recipient-persistence";
import { totalPages } from "@/lib/pagination";
import { acoesPorStatus, type AcaoStatus } from "@/lib/acoes-por-status";
import { PageHeader } from "@/components/PageHeader";
import { useLarguraMinima } from "@/hooks/useLarguraMinima";
import { BarraDeEtapas } from "@/components/equipamentos/BarraDeEtapas";
import { FiltroDeStatus } from "@/components/equipamentos/FiltroDeStatus";
import { useExportarEquipamentos } from "@/hooks/useExportarEquipamentos";
import { useNomesFiltroTecnico, useTecnicos } from "@/hooks/useTecnicos";
import { useEstadoLembrado, usePrimeiraPaginaAoFiltrar } from "@/hooks/useEstadoLembrado";
import { emailDoTecnico } from "@/lib/tecnicos";
import { usePecasBaixaPendente } from "@/hooks/usePecasBaixaPendente";
import { ResumoComunicacoes } from "@/components/equipamentos/ResumoComunicacoes";
import { BarraDeEtapasGrande } from "@/components/equipamentos/BarraDeEtapasGrande";
import { OrcamentoDaOs } from "@/components/equipamentos/OrcamentoDaOs";
import { CartaoCliente } from "@/components/detalhe/CartaoCliente";
import { HistoricoOs } from "@/components/equipamentos/HistoricoOs";

// O anel é a borda de um ::after dentro da célula. O box-shadow fica por baixo
// do divisor colapsado e, na Ações sticky, o fundo branco cobre o topo.
// border-separate deixa esse divisor fora do anel. O anel segue só o
// :focus-visible do botão .equipment-row-open, então o clique do mouse não
// acende e os botões de Ações continuam fora de um role=button.
const EQUIPMENT_ROW_FOCUS_RING =
  "border-b group-has-[.equipment-row-open:focus-visible]:z-[30] group-has-[.equipment-row-open:focus-visible]:bg-status-work-bg group-has-[.equipment-row-open:focus-visible]:after:pointer-events-none group-has-[.equipment-row-open:focus-visible]:after:absolute group-has-[.equipment-row-open:focus-visible]:after:inset-0 group-has-[.equipment-row-open:focus-visible]:after:z-[1] group-has-[.equipment-row-open:focus-visible]:after:border-y-[3px] group-has-[.equipment-row-open:focus-visible]:after:border-ring group-has-[.equipment-row-open:focus-visible]:after:content-['']";
const EQUIPMENT_ROW_FOCUS_EDGE = `relative ${EQUIPMENT_ROW_FOCUS_RING}`;
const EQUIPMENT_ROW_FOCUS_FIRST = `relative ${EQUIPMENT_ROW_FOCUS_RING} group-has-[.equipment-row-open:focus-visible]:after:border-l-[3px]`;
const EQUIPMENT_ROW_FOCUS_LAST = `${EQUIPMENT_ROW_FOCUS_RING} group-has-[.equipment-row-open:focus-visible]:after:border-r-[3px]`;

export default function Equipamentos() {
  // Filtro, busca, ordenação e página voltam como estavam ao reabrir a lista (na mesma sessão).
  const [busca, setBusca] = useEstadoLembrado("equipamentos:busca", "");
  const [statusFiltro, setStatusFiltro] = useEstadoLembrado("equipamentos:status", "TODOS");
  const [ordenacao, setOrdenacao] = useEstadoLembrado<"ATUALIZACAO_RECENTE" | "CADASTRO_RECENTE">("equipamentos:ordenacao", "ATUALIZACAO_RECENTE");
  const [paginaEquipamentos, setPaginaEquipamentos] = useEstadoLembrado("equipamentos:pagina", 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  // Detalhes da OS: a rota /equipamentos/:id manda, e o estado local acompanha
  // (o mesmo componente atende a lista e os detalhes; ver idDetalhesRota abaixo).
  const [idDetalhesAberto, setIdDetalhesAberto] = useState<number | null>(null);
  const detalhesDialogOpen = idDetalhesAberto != null;
  const detalhesAbertoRef = useRef(false);
  const [sinalPortal, setSinalPortal] = useState(0);
  detalhesAbertoRef.current = detalhesDialogOpen;
  // Resposta do cliente lida ao abrir a aprovação; segue junto dela para barrar tela desatualizada.
  // Só a aprovação escreve aqui: recarregar o quadro em segundo plano não pode trocar o que o operador conferiu.
  const respostaClienteVistaRef = useRef(0);
  // Decisão do cliente (ainda não aplicada) que o operador está conferindo, e o motivo se ele divergir dela.
  const [respostaClienteDecisao, setRespostaClienteDecisao] = useState<"APROVAR" | "RECUSAR" | null>(null);
  const [motivoDivergencia, setMotivoDivergencia] = useState("");
  const [corrigirDecisaoAlvo, setCorrigirDecisaoAlvo] = useState<Equipamento | null>(null);
  const [reabrirAlvo, setReabrirAlvo] = useState<Equipamento | null>(null);
  // Diálogo "Mudar Status" aberto sem status pré-selecionado: REPROVADO não oferece "Aguardando aprovação" aí (use "Nova proposta").
  const [statusSemPreSelecao, setStatusSemPreSelecao] = useState(false);
  const [verificacaoDialogOpen, setVerificacaoDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [pagamentoDialogOpen, setPagamentoDialogOpen] = useState(false);
  const [pagamentoAprovacaoLoading, setPagamentoAprovacaoLoading] = useState(false);
  const [pagamentoAprovacaoError, setPagamentoAprovacaoError] = useState<string | null>(null);
  const [pagamentoAprovacaoInicial, setPagamentoAprovacaoInicial] = useState<FormaPagamento | null>(null);
  const [selecaoServicosOpen, setSelecaoServicosOpen] = useState(false);
  const [servicosAprovacao, setServicosAprovacao] = useState<ServicoNecessario[]>([]);
  const [produtosAprovacao, setProdutosAprovacao] = useState<Produto[]>([]);
  const [todosServicosAprovados, setTodosServicosAprovados] = useState<boolean | null>(null);
  const [idsAprovados, setIdsAprovados] = useState<string[]>([]);
  const [totalOrcamentoAprovacao, setTotalOrcamentoAprovacao] = useState<number | undefined>();
  const decisaoAprovada = todosServicosAprovados === true || idsAprovados.length > 0;
  const [escolhaAjuste, setEscolhaAjuste] = useState<{ variante: "aprovado" | "pendente"; analise: AnaliseAjusteOrcamento } | null>(null);
  const escolhaAjusteResolver = useRef<((opcoes: OpcoesAjusteOrcamento | null) => void) | null>(null);
  const garantiaConfirmadaRef = useRef(false);
  const [consumosDetalhes, setConsumosDetalhes] = useState<ConsumoOrcamento[]>([]);
  const [baixandoPendentes, setBaixandoPendentes] = useState(false);
  const [consumosDialogOpen, setConsumosDialogOpen] = useState(false);
  const [ajusteOrcamentoSemMudancaStatus, setAjusteOrcamentoSemMudancaStatus] = useState(false);
  const [correcaoStatus, setCorrecaoStatus] = useState(false);
  const [motivoCorrecaoStatus, setMotivoCorrecaoStatus] = useState("");
  const [editando, setEditando] = useState<Equipamento | null>(null);
  const [envioManual, setEnvioManual] = useState<EnvioManualOrcamento | null>(null);
  const [quemRecebe, setQuemRecebe] = useState<{
    eq: Equipamento;
    sugestao: { nome: string; telefone: string; email: string };
    continuar: (eq: Equipamento) => Promise<void>;
  } | null>(null);
  const [deletando, setDeletando] = useState<Equipamento | null>(null);
  const [selecionado, setSelecionado] = useState<Equipamento | null>(null);
  const [abaDetalhe, setAbaDetalhe] = useState("orcamento");
  useEffect(() => { setAbaDetalhe("orcamento"); }, [selecionado?.id]);
  /** Recarrega o selo "baixa pendente" ao fechar Peças da OS (a baixa pode ter sido confirmada lá). */
  const [recargaPendentes, setRecargaPendentes] = useState(0);
  const pecasPendentes = usePecasBaixaPendente(selecionado?.id, recargaPendentes);
  const selecionadoIdRef = useRef<number | undefined>();
  selecionadoIdRef.current = selecionado?.id;
  const [salvando, setSalvando] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{
    artifact: PdfArtifact;
    tipo: "orcamento" | "ordem" | "relatorio";
    equipamento: Equipamento;
    verificacao?: Verificacao;
    prazoMin?: number;
    prazoMax?: number;
  } | null>(null);
  const [pdfPrazoUpdating, setPdfPrazoUpdating] = useState(false);

  // Duplicidade de serial (múltiplos ciclos de manutenção)
  const [registrosAnteriores, setRegistrosAnteriores] = useState<Equipamento[]>([]);
  const [confirmouNovoCiclo, setConfirmouNovoCiclo] = useState(false);
  // Equipamento anterior clicado no cadastro que ainda está em atendimento (não serve de base).
  const [anteriorEmAtendimento, setAnteriorEmAtendimento] = useState<Equipamento | null>(null);
  const [sugestoesSerial, setSugestoesSerial] = useState<Equipamento[]>([]);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);

  // Dados do drawer de detalhes
  const [verificacaoDetalhes, setVerificacaoDetalhes] = useState<Verificacao | null>(null);
  const [comunicacoes, setComunicacoes] = useState<Comunicacao[]>([]);
  /** Última vez que o orçamento saiu para o cliente (cabeçalho da aba Orçamento). */
  const orcamentoEnviadoEm = useMemo(() => {
    const enviados = comunicacoes.filter((c) => c.tipo === "ORCAMENTO" && c.enviado !== false);
    const datas = enviados.map((c) => c.data_envio || c.criado_em).filter((d): d is string => Boolean(d)).sort();
    return datas.at(-1) ?? null;
  }, [comunicacoes]);
  const [imagensDetalhes, setImagensDetalhes] = useState<EquipamentoImagemDraft[]>([]);
  const [historicoDetalhes, setHistoricoDetalhes] = useState<EquipamentoHistoricoEvento[]>([]);
  const [historicoDetalhesError, setHistoricoDetalhesError] = useState<string | null>(null);
  const [carregandoDetalhes, setCarregandoDetalhes] = useState(false);

  // Mudança de status
  const [novoStatus, setNovoStatus] = useState("");
  const [valorOrcamento, setValorOrcamento] = useState<number>(0);
  const [valorOrcamentoValido, setValorOrcamentoValido] = useState(true);
  const valorOrcamentoRef = useRef(valorOrcamento);
  useEffect(() => { valorOrcamentoRef.current = valorOrcamento; }, [valorOrcamento]);
  const [prazoAprovacao, setPrazoAprovacao] = useState("");
  const [valorOrcamentoOriginal, setValorOrcamentoOriginal] = useState<number | null>(null);
  const [valorOrcamentoAnterior, setValorOrcamentoAnterior] = useState<number | null>(null);
  const [verificacaoAjusteOrcamento, setVerificacaoAjusteOrcamento] = useState<Verificacao | null>(null);
  const [servicosAjuste, setServicosAjuste] = useState<ServicoNecessario[]>([]);
  const [pecasLegadasAjuste, setPecasLegadasAjuste] = useState<PecaNecessaria[]>([]);
  const [observacoesAjuste, setObservacoesAjuste] = useState("");
  const [formaPagamentoAjuste, setFormaPagamentoAjuste] = useState<FormaPagamentoCodigo | "">("");
  const [detalhePagamentoAjuste, setDetalhePagamentoAjuste] = useState("");
  const [catalogoServicosAjuste, setCatalogoServicosAjuste] = useState<ServicoCatalogo[]>([]);
  const [carregandoCatalogoAjuste, setCarregandoCatalogoAjuste] = useState(false);
  const [valorFinal, setValorFinal] = useState<number>(0);
  const [valorFinalSugerido, setValorFinalSugerido] = useState<number | null>(null);
  const [acordoExcecaoEntrega, setAcordoExcecaoEntrega] = useState(false);
  const tecnicos = useTecnicos();
  const primeiroTecnico = tecnicos[0]?.nome ?? "";
  const nomesFiltroTecnico = useNomesFiltroTecnico();
  const [tecnicoNovoEquipamento, setTecnicoNovoEquipamento] = useState<TecnicoDisponivel>("");
  const [marcaOutroOpen, setMarcaOutroOpen] = useState(false);
  const [tipoOutroOpen, setTipoOutroOpen] = useState(false);
  const [imagensSaidaEntrega, setImagensSaidaEntrega] = useState<EquipamentoImagemDraft[]>([]);
  const [erroImagensSaidaEntrega, setErroImagensSaidaEntrega] = useState<string | null>(null);
  const [carregandoImagensSaidaEntrega, setCarregandoImagensSaidaEntrega] = useState(false);
  const [imagemExpandida, setImagemExpandida] = useState<EquipamentoImagemDraft | null>(null);

  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [photoUploadCategoria, setPhotoUploadCategoria] = useState<"ENTRADA" | "SAIDA">("ENTRADA");
  const [photoUploadNewEquip, setPhotoUploadNewEquip] = useState(false);

  // Cliente vinculado ao equipamento (gerenciado pelo ClienteSelector)
  const [clienteVinculado, setClienteVinculado] = useState<Cliente | null>(null);
  const [responsavelVinculado, setResponsavelVinculado] = useState<ClienteContato | null>(null);
  const [erroCliente, setErroCliente] = useState<string | null>(null);
  const [imagensFormulario, setImagensFormulario] = useState<EquipamentoImagemDraft[]>([]);
  const [erroImagens, setErroImagens] = useState<string | null>(null);
  const [carregandoImagensFormulario, setCarregandoImagensFormulario] = useState(false);
  const fotoEdicaoSeq = useRef(0);
  const fotoEdicaoEquipamentoId = useRef<number | null>(null);
  const baselineFotosRef = useRef<{ equipamentoId: number; fotos: EquipamentoImagemDraft[] } | null>(null);

  const { success, error: showError, warning } = useNotification();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmProps, setConfirmProps] = useState<{
    title: string;
    description?: string;
    variant?: "default" | "destructive";
    cancelVariant?: "outline" | "destructive";
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({ title: "", description: "", onConfirm: () => {} });

  const [emailFlow, setEmailFlow] = useState<{
    recipient: ResolvedRecipient;
    onConfirm: (email: string, salvar: boolean) => void | Promise<boolean | void>;
    onSkip: () => void | Promise<void>;
  } | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  const [tecnicoFiltro, setTecnicoFiltro] = useEstadoLembrado("equipamentos:tecnico", "TODOS");
  const [exportando, setExportando] = useState(false);
  const exportarEquipamentos = useExportarEquipamentos();
  async function baixarCsv() {
    setExportando(true);
    try {
      const nome = await exportarEquipamentos({ busca: busca || undefined, status: statusFiltro, tecnico: tecnicoFiltro === "TODOS" ? undefined : tecnicoFiltro, ordenacao });
      success("Equipamentos", `Lista salva em ${nome}, na pasta temporária do app.`);
    } catch (err) {
      showError("Equipamentos", "Exportar lista", err);
    } finally {
      setExportando(false);
    }
  }
  const { equipamentos, total: totalEquipamentos, contagens: contagensStatus, loading, error: erroListaEquipamentos, avisoAtualizacao, criar, atualizar, deletar, atualizarStatus, recarregar, atualizarEmSegundoPlano } =
    useEquipamentos({ busca: busca || undefined, status: statusFiltro, tecnico: tecnicoFiltro === "TODOS" ? undefined : tecnicoFiltro, ordenacao, page: paginaEquipamentos });
  const totalPaginasEquipamentos = totalPages(totalEquipamentos);
  const paginaEquipamentosExibida = Math.min(paginaEquipamentos, totalPaginasEquipamentos);
  const equipamentosExibidos = equipamentos;

  usePrimeiraPaginaAoFiltrar([busca, statusFiltro, ordenacao, tecnicoFiltro], () => setPaginaEquipamentos(1));

  // Só limita a página depois de o total chegar: antes dele, a página lembrada valeria 1.
  useEffect(() => {
    if (loading) return;
    setPaginaEquipamentos((pagina) => Math.min(pagina, totalPaginasEquipamentos));
  }, [totalPaginasEquipamentos, loading, setPaginaEquipamentos]);

  // Hook de automação de status
  const { loading: loadingAutomacao, finalizarVerificacao, marcarComoPronto } =
    useStatusEquipamento();
  const { ensureSensitiveAccess, status: sensitiveStatus, hasPermission } = useSensitiveAccess();
  const location = useLocation();
  const navigate = useNavigate();
  const telaLarga = useLarguraMinima(768);
  const irParaConfiguracoesPortal = useCallback(() => navigate("/configuracoes?aba=portal"), [navigate]);
  const pathnameAtualRef = useRef(location.pathname);
  pathnameAtualRef.current = location.pathname;
  const idDetalhesRota = (() => {
    const encontrado = /^\/equipamentos\/(\d+)\/?$/.exec(location.pathname);
    return encontrado ? Number(encontrado[1]) : null;
  })();
  // Voltar/avançar do navegador ou link direto: o endereço abre ou fecha os detalhes.
  useEffect(() => {
    setIdDetalhesAberto(idDetalhesRota);
  }, [idDetalhesRota]);
  // Ajuste de orçamento em página (decisão 24): /equipamentos/:id/orcamento.
  const idAjusteRota = (() => {
    const encontrado = /^\/equipamentos\/(\d+)\/orcamento\/?$/.exec(location.pathname);
    return encontrado ? Number(encontrado[1]) : null;
  })();
  // Verificação técnica em página (decisão 24): /equipamentos/:id/verificacao.
  const idVerificacaoRota = (() => {
    const encontrado = /^\/equipamentos\/(\d+)\/verificacao\/?$/.exec(location.pathname);
    return encontrado ? Number(encontrado[1]) : null;
  })();
  /** De onde a pessoa abriu a verificação: Cancelar e finalizar voltam para lá. */
  const origemVerificacaoRef = useRef<string>("/equipamentos");
  /** De onde a pessoa abriu o ajuste: Cancelar e salvar voltam para lá. */
  const origemAjusteRef = useRef<string>("/equipamentos");

  // Diálogo com algo sendo preenchido: abrir outro atendimento por cima perderia o que foi digitado.
  const edicaoEmAndamento =
    dialogOpen ? "o cadastro do equipamento"
    : verificacaoDialogOpen ? "a verificação técnica"
    : statusDialogOpen ? "a mudança de status"
    : pagamentoDialogOpen ? "a forma de pagamento"
    : selecaoServicosOpen ? "a decisão do orçamento"
    : consumosDialogOpen ? "as peças da OS"
    : corrigirDecisaoAlvo !== null ? "a correção da decisão"
    : emailDialogOpen ? "o envio de email"
    : photoUploadOpen ? "o envio de fotos"
    : deleteDialogOpen || confirmOpen ? "a confirmação aberta"
    : null;
  const avisoEdicaoPendente = useRef<unknown>(null);

  // Vindo de um alerta/atalho: abre o atendimento pedido. Se outra janela de detalhes estiver
  // aberta, troca na hora; só espera quando há um formulário em preenchimento.
  useEffect(() => {
    const state = location.state as { equipamentoId?: number; novaEntrada?: boolean; statusFiltro?: string } | null;
    // Cartão ou etapa do Início: abre a lista já filtrada por aquele status.
    if (state?.statusFiltro) {
      navigate(location.pathname, { replace: true, state: {} });
      // Pedido explícito: a lista mostra a etapa inteira, sem a busca ou o técnico lembrados.
      setStatusFiltro(state.statusFiltro);
      setBusca("");
      setTecnicoFiltro("TODOS");
      return;
    }
    // "+ Nova entrada" do Início: abre o cadastro direto.
    if (state?.novaEntrada) {
      navigate(location.pathname, { replace: true, state: {} });
      void abrirNovo();
      return;
    }
    if (!state?.equipamentoId) return;
    if (edicaoEmAndamento) {
      if (avisoEdicaoPendente.current !== state) {
        avisoEdicaoPendente.current = state;
        toast.warning("Equipamentos — Abrir atendimento", {
          id: AVISO_ATENDIMENTO_PENDENTE,
          description: `Termine ou feche ${edicaoEmAndamento}. O atendimento do alerta abre em seguida.`,
          duration: Infinity,
        });
      }
      return;
    }
    toast.dismiss(AVISO_ATENDIMENTO_PENDENTE);
    navigate(location.pathname, { replace: true, state: {} });
    db.buscarEquipamento(state.equipamentoId)
      .then((eq) => abrirDetalhes(eq))
      .catch((err) => {
        console.error("Erro ao buscar equipamento do estado de navegação:", err);
      });
  }, [location.state, edicaoEmAndamento]);

  // Cliente respondeu/pediu algo no portal: a lista reordena sem o operador recarregar, e o
  // atendimento aberto mostra o estado novo.
  useEffect(() => {
    const aoChegar = (event: Event) => {
      const ids = (event as CustomEvent<{ equipamentoIds?: number[] }>).detail?.equipamentoIds ?? [];
      void atualizarEmSegundoPlano();
      const abertoId = selecionadoIdRef.current;
      if (detalhesAbertoRef.current && abertoId && ids.includes(abertoId)) {
        setSinalPortal((valor) => valor + 1);
        db.buscarEquipamento(abertoId)
          .then((eq) => { if (selecionadoIdRef.current === eq.id) setSelecionado(eq); })
          .catch(() => undefined);
      }
    };
    window.addEventListener(EVENTO_ALERTAS_PORTAL, aoChegar);
    return () => window.removeEventListener(EVENTO_ALERTAS_PORTAL, aoChegar);
  }, [atualizarEmSegundoPlano]);

  const carregarImagensComPreview = useCallback(async (equipamentoId: number) => {
    const imagens = await db.listarImagensEquipamento(equipamentoId);
    return Promise.all(imagens.map(imagemPersistidaParaDraft));
  }, []);

  // ─── Event listener: photo-received ────────────────────
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<{ equipamento_id: number; imagem_id: number }>("photo-received", (event) => {
      const { equipamento_id } = event.payload;
      if (selecionadoIdRef.current === equipamento_id) {
        carregarImagensComPreview(equipamento_id)
          .then((imagens) => {
            setImagensDetalhes(imagens);
          })
          .catch((err) => {
            console.error("Erro ao recarregar imagens após evento photo-received:", err);
          });
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [carregarImagensComPreview]);

  useEffect(() => {
    if (novoStatus === "AGUARDANDO_APROVACAO" && verificacaoAjusteOrcamento) {
      let pecasTotal = 0;
      try {
        const pecas = JSON.parse(verificacaoAjusteOrcamento.pecas_necessarias || "[]") as PecaNecessaria[];
        pecasTotal = pecas.reduce((sum, p) => sum + (p.valorTotal || 0), 0);
      } catch {
        pecasTotal = 0;
      }
      const servicosTotal = servicosAjuste.reduce((sum, s) => sum + (Number(s.valor) || 0), 0);
      setValorOrcamento(servicosTotal + pecasTotal);
    }
  }, [servicosAjuste, verificacaoAjusteOrcamento, novoStatus]);

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
    fotoEdicaoSeq.current += 1;
    fotoEdicaoEquipamentoId.current = null;
    baselineFotosRef.current = null;
    setEditando(null);
    setClienteVinculado(null);
    setResponsavelVinculado(null);
    setErroCliente(null);
    setErroImagens(null);
    setImagensFormulario([]);
    setCarregandoImagensFormulario(false);
    setTecnicoNovoEquipamento(primeiroTecnico);
    setRegistrosAnteriores([]);
    setConfirmouNovoCiclo(false);
    setAnteriorEmAtendimento(null);
    form.reset({
      serial_number: "", patrimonio: "", marca: "", modelo: "", tipo: "", status: "RECEBIDO",
      defeito_relatado: "", acessorios: [], acessorios_outros: "",
      observacoes: "",
    });
    setDialogOpen(true);
  }

  async function carregarFotosDaEdicao(equipamentoId: number, sequencia: number) {
    baselineFotosRef.current = null;
    setImagensFormulario([]);
    setErroImagens(null);
    setCarregandoImagensFormulario(true);
    const contextoAindaAtivo = () =>
      fotoEdicaoSeq.current === sequencia
      && fotoEdicaoEquipamentoId.current === equipamentoId;

    try {
      const imagens = await carregarImagensComPreview(equipamentoId);
      if (!contextoAindaAtivo()) return;
      const fotos = normalizarOrdemPorCategoria(imagens);
      baselineFotosRef.current = { equipamentoId, fotos };
      setImagensFormulario(fotos);
      setErroImagens(null);
    } catch (err) {
      if (!contextoAindaAtivo()) return;
      console.error("Erro ao carregar imagens do equipamento:", err);
      setErroImagens("Não foi possível carregar as fotos já cadastradas.");
    } finally {
      if (contextoAindaAtivo()) setCarregandoImagensFormulario(false);
    }
  }

  function recarregarFotosDaEdicao() {
    if (!editando?.id) return;
    const sequencia = ++fotoEdicaoSeq.current;
    fotoEdicaoEquipamentoId.current = editando.id;
    void carregarFotosDaEdicao(editando.id, sequencia);
  }

  /** Abre dialog para editar equipamento existente. Carrega cliente vinculado do banco */
  function abrirEditar(eq: Equipamento) {
    const sequencia = ++fotoEdicaoSeq.current;
    fotoEdicaoEquipamentoId.current = eq.id ?? null;
    baselineFotosRef.current = null;
    setEditando(eq);
    setResponsavelVinculado(eq.responsavel_contato_id ? {
      id: eq.responsavel_contato_id,
      empresa_id: eq.empresa_id || 0,
      cliente_id: eq.cliente_id || 0,
      nome: eq.responsavel_nome || "Responsável pelo equipamento",
      email: eq.responsavel_email,
      telefone: eq.responsavel_telefone,
      ativo: true,
    } : null);
    setErroCliente(null);
    setErroImagens(null);
    setImagensFormulario([]);
    setCarregandoImagensFormulario(true);
    setTecnicoNovoEquipamento(extrairTecnicoInicialDeObservacoes(eq.observacoes) || primeiroTecnico);
    if (eq.id) void carregarFotosDaEdicao(eq.id, sequencia);
    else setCarregandoImagensFormulario(false);
    // Se o equipamento tem cliente_id, carregar do banco; senão, montar objeto parcial
    if (eq.cliente_id) {
      // O fallback imediato mantém a seleção do responsável enquanto o
      // cadastro completo do cliente é carregado pelo backend.
      setClienteVinculado({
        id: eq.cliente_id,
        empresa_id: eq.empresa_id,
        nome: eq.cliente_nome,
        telefone: eq.cliente_telefone || "",
        email: eq.cliente_email || undefined,
      });
      db.buscarCliente(eq.cliente_id).then((c) => {
        if (fotoEdicaoSeq.current !== sequencia || fotoEdicaoEquipamentoId.current !== eq.id) return;
        if (c) setClienteVinculado(c);
      }).catch(() => {
        if (fotoEdicaoSeq.current !== sequencia || fotoEdicaoEquipamentoId.current !== eq.id) return;
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
    const sequenciaEdicao = fotoEdicaoSeq.current;
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
      const resultados = await Promise.allSettled(
        arquivosProcessados.map((arquivo, index) =>
          arquivoParaImagemEquipamento(
            arquivo,
            filtrarImagensPorCategoria(imagensFormulario, categoria).length + index,
            categoria,
          ).then((imagem) => ({ sucesso: true as const, imagem, arquivo }))
            .catch((err: any) => ({ sucesso: false as const, erro: err?.message || String(err), arquivo }))
        )
      );

      if (fotoEdicaoSeq.current !== sequenciaEdicao) return;

      const imagensBemSucedidas = resultados
        .filter((r): r is PromiseFulfilledResult<{ sucesso: true; imagem: any; arquivo: File }> => r.status === "fulfilled" && r.value.sucesso)
        .map((r) => r.value.imagem);

      const erros = resultados
        .filter((r): r is PromiseFulfilledResult<{ sucesso: false; erro: string; arquivo: File }> => r.status === "fulfilled" && !r.value.sucesso)
        .map((r) => `${r.value.arquivo.name}: ${r.value.erro}`);

      if (imagensBemSucedidas.length > 0) {
        setImagensFormulario((estadoAtual) =>
          normalizarOrdemPorCategoria([...estadoAtual, ...imagensBemSucedidas])
        );
      }

      const mensagensErro: string[] = [];
      if (arquivos.length > arquivosProcessados.length) {
        mensagensErro.push(`Somente ${LIMITE_IMAGENS_POR_EQUIPAMENTO} fotos podem ser mantidas por equipamento.`);
      }
      if (erros.length > 0) {
        mensagensErro.push(`Erros no processamento:\n${erros.join("\n")}`);
      }
      setErroImagens(mensagensErro.length > 0 ? mensagensErro.join("\n") : null);
    } catch (err: any) {
      if (fotoEdicaoSeq.current !== sequenciaEdicao) return;
      console.error("Erro ao processar imagens do equipamento:", err);
      setErroImagens(err?.message || "Não foi possível processar as fotos selecionadas.");
    } finally {
      if (fotoEdicaoSeq.current === sequenciaEdicao) setCarregandoImagensFormulario(false);
    }
  }

  /** Ao perder foco no campo serial, busca registros existentes com mesmo número de série */
  async function handleSerialBlur() {
    const serial = form.getValues("serial_number");
    // Esconde sugestões após blur (delay pra permitir clique)
    setTimeout(() => setMostrarSugestoes(false), 200);
    if (!serial || serial.trim().length < 3) {
      setRegistrosAnteriores([]);
      setConfirmouNovoCiclo(false);
      return;
    }
    try {
      const registros = await db.buscarEquipamentosPorSerial(serial);
      const anteriores = editando
        ? registros.filter((r) => r.id !== editando.id)
        : registros;
      setRegistrosAnteriores(anteriores);
      setConfirmouNovoCiclo(false);
    } catch (err) {
      console.error("Erro ao buscar registros anteriores:", err);
    }
  }

  /**
   * Cadastro novo: clicar num equipamento anterior do cliente reaproveita só os dados do aparelho
   * quando o atendimento já foi encerrado; se ainda está em atendimento, avisa e não preenche.
   */
  async function usarEquipamentoAnterior(anterior: Equipamento) {
    const resultado = await usarEquipamentoAnteriorNoCadastro(form, anterior, (serial) => db.buscarEquipamentosPorSerial(serial));
    if (resultado.tipo === "em_atendimento") {
      setAnteriorEmAtendimento(anterior);
      return;
    }
    setAnteriorEmAtendimento(null);
    setMostrarSugestoes(false);
    setRegistrosAnteriores(resultado.registros);
    setConfirmouNovoCiclo(resultado.confirmarNovoCiclo);
    toast.success(MENSAGEM_DADOS_PREENCHIDOS, { duration: 3000 });
  }

  async function handleSerialInput(value: string) {
    const serial = value.trim();
    if (serial.length < 2) { setSugestoesSerial([]); setMostrarSugestoes(false); return; }
    try {
      const registros = await db.buscarEquipamentosPorSerial(serial);
      setSugestoesSerial(registros.filter((r) => r.serial_number.toLowerCase().startsWith(serial.toLowerCase())));
      setMostrarSugestoes(true);
    } catch { setSugestoesSerial([]); }
  }

  function selecionarSerialSugestao(serial: string) {
    form.setValue("serial_number", serial);
    setMostrarSugestoes(false);
    void handleSerialBlur();
  }

  function removerImagemFormulario(imagem: EquipamentoImagemDraft) {
    setImagensFormulario((estadoAtual) =>
      normalizarOrdemPorCategoria(estadoAtual.filter((img) => img.local_id !== imagem.local_id))
    );
    setErroImagens(null);
  }

  function atualizarLegendaImagem(imagem: EquipamentoImagemDraft, value: string) {
    setImagensFormulario((estadoAtual) =>
      estadoAtual.map((img) => (
        img.local_id === imagem.local_id
          ? { ...img, observacao: value.slice(0, 280) }
          : img
      ))
    );
  }

  async function removerImagemDetalhes(imagem: EquipamentoImagemDraft) {
    if (!imagem.id || !selecionado?.id) return;
    try {
      await db.removerImagemEquipamento(imagem.id);
      success("Equipamentos", "Foto removida com sucesso", "Remover foto");
      const imagens = await carregarImagensComPreview(selecionado.id);
      setImagensDetalhes(imagens);
    } catch (err) {
      console.error("Erro ao remover imagem:", err);
      showError("Equipamentos", "Remover foto", err);
    }
  }

  /**
   * Abre dialog de detalhes com 4 abas. Carrega verificação e comunicações em paralelo.
   * Conecta-se a: db.buscarVerificacao, db.listarComunicacoes
   */
  const detalhesSeq = useRef(0);
  const abrirDetalhes = useCallback(async (eq: Equipamento) => {
    // Trocar de atendimento com a janela aberta: só a última abertura grava os dados.
    const seq = ++detalhesSeq.current;
    setSelecionado(eq);
    setIdDetalhesAberto(eq.id ?? null);
    const destino = `/equipamentos/${eq.id}`;
    if (pathnameAtualRef.current !== destino) navigate(destino);
    setCarregandoDetalhes(true);
    setVerificacaoDetalhes(null);
    setComunicacoes([]);
    setImagensDetalhes([]);
    setHistoricoDetalhes([]);
    setHistoricoDetalhesError(null);
    try {
      const [verif, comms, imagens, historico] = await Promise.allSettled([
        db.buscarVerificacao(eq.id!),
        db.listarComunicacoes(eq.id!),
        carregarImagensComPreview(eq.id!),
        db.listarHistoricoEquipamento(eq.id!),
      ]);
      if (seq !== detalhesSeq.current) return;
      setVerificacaoDetalhes(verif.status === "fulfilled" ? verif.value : null);
      setComunicacoes(comms.status === "fulfilled" ? comms.value : []);
      setImagensDetalhes(imagens.status === "fulfilled" ? imagens.value : []);
      setHistoricoDetalhes(historico.status === "fulfilled" ? historico.value : []);
      setHistoricoDetalhesError(
        historico.status === "rejected"
          ? "Não foi possível carregar o histórico deste equipamento. " + String(historico.reason)
          : null,
      );
    } catch (err) {
      console.error("Erro ao carregar detalhes:", err);
    } finally {
      if (seq === detalhesSeq.current) setCarregandoDetalhes(false);
    }
  }, [carregarImagensComPreview, navigate]);

  // Rota aberta direto (voltar/avançar do navegador, link): carrega a OS do endereço.
  useEffect(() => {
    if (idDetalhesRota == null || selecionadoIdRef.current === idDetalhesRota) return;
    db.buscarEquipamento(idDetalhesRota)
      .then((eq) => abrirDetalhes(eq))
      .catch((err) => {
        showError("Equipamentos", "Abrir atendimento", err);
        navigate("/equipamentos", { replace: true });
      });
  }, [idDetalhesRota, abrirDetalhes, navigate]);

  const paginaVerificacaoAbertaRef = useRef(false);
  paginaVerificacaoAbertaRef.current = verificacaoDialogOpen;
  /** Abre a página de verificação técnica (VerificacaoTecnica.tsx, /equipamentos/:id/verificacao). */
  function abrirVerificacao(eq: Equipamento, origem?: string) {
    setSelecionado(eq);
    setVerificacaoDialogOpen(true);
    paginaVerificacaoAbertaRef.current = true;
    origemVerificacaoRef.current = origem ?? pathnameAtualRef.current;
    const destino = `/equipamentos/${eq.id}/verificacao`;
    if (pathnameAtualRef.current !== destino) navigate(destino);
  }

  /**
   * Sai da página da verificação e volta para onde a pessoa estava. Voltando aos detalhes, eles
   * são carregados de novo: depois de finalizar mudaram, e num link direto nunca foram carregados.
   */
  function fecharPaginaVerificacao() {
    // Finalizar já fecha; o "fechar" que a página manda logo depois não navega de novo.
    if (!paginaVerificacaoAbertaRef.current) return;
    paginaVerificacaoAbertaRef.current = false;
    const alvo = selecionado;
    setVerificacaoDialogOpen(false);
    const origem = origemVerificacaoRef.current;
    if (alvo?.id && origem === `/equipamentos/${alvo.id}`) {
      db.buscarEquipamento(alvo.id).then((eq) => abrirDetalhes(eq)).catch(() => navigate(origem));
      return;
    }
    if (pathnameAtualRef.current !== origem) navigate(origem);
  }

  // Link direto, voltar ou avançar até a verificação: abre a página se a OS está em verificação.
  const idVerificacaoRotaAnterior = useRef<number | null>(null);
  useEffect(() => {
    const anterior = idVerificacaoRotaAnterior.current;
    idVerificacaoRotaAnterior.current = idVerificacaoRota;
    // A resposta só vale enquanto a pessoa continua nesta rota.
    let ativo = true;
    if (idVerificacaoRota != null && !paginaVerificacaoAbertaRef.current) {
      const origem = `/equipamentos/${idVerificacaoRota}`;
      db.buscarEquipamento(idVerificacaoRota)
        .then((eq) => {
          if (!ativo) return;
          if (eq.status === "EM_VERIFICACAO") abrirVerificacao(eq, origem);
          else navigate(origem, { replace: true });
        })
        .catch((err) => {
          if (!ativo) return;
          showError("Equipamentos", "Abrir verificação", err);
          navigate("/equipamentos", { replace: true });
        });
    } else if (idVerificacaoRota == null && anterior != null && paginaVerificacaoAbertaRef.current) {
      // Saiu da página pelo navegador: a verificação não finalizada é descartada.
      setVerificacaoDialogOpen(false);
    }
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idVerificacaoRota]);

  /** Abre dialog de mudança manual de status com opção de pré-selecionar o status */
  async function prepararValorEntregaPadrao(eq: Equipamento) {
    const verificacao = await db.buscarVerificacao(eq.id!);
    const sugerido = verificacao?.custo_total ?? eq.valor_orcamento ?? 0;
    setValorFinalSugerido(sugerido);
    setValorFinal(sugerido);
    setAcordoExcecaoEntrega(false);
  }

  async function prepararAjusteOrcamentoPadrao(eq: Equipamento) {
    const verificacao = await db.buscarVerificacao(eq.id!, eq.empresa_id);
    const valorOriginal = verificacao?.custo_total ?? null;
    const valorAnterior = eq.valor_orcamento ?? null;
    const valorBase = eq.valor_orcamento ?? verificacao?.custo_total ?? 0;
    setValorOrcamentoOriginal(valorOriginal);
    setValorOrcamentoAnterior(valorAnterior);
    setValorOrcamento(valorBase);
    setValorOrcamentoValido(true);
    setPrazoAprovacao(eq.prazo_aprovacao || "");
    setVerificacaoAjusteOrcamento(verificacao);
    setObservacoesAjuste(verificacao?.observacoes || "");
    if (orcamentoJaAprovado(eq.status) && verificacao?.forma_pagamento_codigo) {
      setFormaPagamentoAjuste(verificacao.forma_pagamento_codigo);
      setDetalhePagamentoAjuste(verificacao.forma_pagamento_detalhe || "");
    } else {
      setFormaPagamentoAjuste("");
      setDetalhePagamentoAjuste("");
    }

    let servicosIniciais: ServicoNecessario[] = [];
    try {
      servicosIniciais = JSON.parse(verificacao?.servicos_necessarios || "[]") as ServicoNecessario[];
    } catch {
      servicosIniciais = [];
    }
    setServicosAjuste(normalizarServicosOrcamento(servicosIniciais));
    try {
      const todas = JSON.parse(verificacao?.pecas_necessarias || "[]") as PecaNecessaria[];
      const vinculadas = new Set(pecasParaOrcamento(normalizarServicosOrcamento(servicosIniciais)).map((p) => p.id));
      setPecasLegadasAjuste(todas.filter((p) => !vinculadas.has(p.id)));
    } catch { setPecasLegadasAjuste([]); }

    setCarregandoCatalogoAjuste(true);
    try {
      const catalogo = await db.listarServicosCatalogoAtivos();
      setCatalogoServicosAjuste(catalogo);
    } catch (err) {
      console.error("Erro ao carregar catálogo de serviços:", err);
    } finally {
      setCarregandoCatalogoAjuste(false);
    }
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
      title: "Alterar status",
      description: "Informe o PIN para abrir a mudança de status. A ação escolhida será conferida na confirmação.",
    });
    if (!liberado) return;

    setAjusteOrcamentoSemMudancaStatus(false);
    setCorrecaoStatus(false);
    setMotivoCorrecaoStatus("");
    setSelecionado(eq);
    setNovoStatus(statusPreSelecionado || "");
    setStatusSemPreSelecao(!statusPreSelecionado);
    setValorOrcamento(eq.valor_orcamento ?? 0);
    setValorOrcamentoValido(true);
    setPrazoAprovacao(eq.prazo_aprovacao || "");
    setValorOrcamentoOriginal(null);
    setValorOrcamentoAnterior(null);
    setVerificacaoAjusteOrcamento(null);
    setServicosAjuste([]);
    setPecasLegadasAjuste([]);
    setObservacoesAjuste("");
    setFormaPagamentoAjuste("");
    setDetalhePagamentoAjuste("");
    setCatalogoServicosAjuste([]);
    setCarregandoCatalogoAjuste(false);
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
    if ((statusPreSelecionado || "") === "AGUARDANDO_APROVACAO" && !reabreOrcamentoSemAjuste(eq.status, statusPreSelecionado || "")) {
      await prepararAjusteOrcamentoPadrao(eq);
    }
    setStatusDialogOpen(true);
  }

  async function abrirCorrigirDecisao(eq: Equipamento) {
    const liberado = await ensureSensitiveAccess({
      title: "Corrigir decisão do orçamento",
      description: "Informe o PIN para reabrir um orçamento já decidido. Pagamento, serviços e estoque serão conferidos.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) return;
    setCorrigirDecisaoAlvo(eq);
  }

  async function abrirCorrecaoStatus(eq: Equipamento) {
    const liberado = await ensureSensitiveAccess({
      title: "Corrigir status",
      description: "Informe o PIN para corrigir um status lançado por engano. A correção ficará registrada na auditoria.",
      permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS,
    });
    if (!liberado) return;

    setSelecionado(eq);
    setAjusteOrcamentoSemMudancaStatus(false);
    setCorrecaoStatus(true);
    setMotivoCorrecaoStatus("");
    setNovoStatus("");
    setValorOrcamento(eq.valor_orcamento ?? 0);
    setValorOrcamentoValido(true);
    setPrazoAprovacao(eq.prazo_aprovacao || "");
    setValorFinal(0);
    setStatusDialogOpen(true);
  }

  /** `aindaValido`: num link direto, para de abrir se a pessoa saiu da rota enquanto o PIN ou a carga esperavam. */
  async function abrirAlterarOrcamento(eq: Equipamento, origem?: string, aindaValido: () => boolean = () => true): Promise<boolean> {
    const liberado = await ensureSensitiveAccess({
      title: "Alterar orçamento",
      description: "Informe o PIN para editar serviços e valor sem alterar o status do equipamento.",
      ...(orcamentoEmElaboracao(eq.status)
        ? { anyPermission: [SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES] }
        : { permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS }),
    });
    if (!liberado || !aindaValido()) return false;

    setSelecionado(eq);
    setNovoStatus("");
    setAjusteOrcamentoSemMudancaStatus(true);
    setCorrecaoStatus(false);
    setMotivoCorrecaoStatus("");
    setPrazoAprovacao(eq.prazo_aprovacao || "");
    setValorFinal(0);
    setValorFinalSugerido(null);
    setAcordoExcecaoEntrega(false);
    await prepararAjusteOrcamentoPadrao(eq);
    if (!aindaValido()) {
      setAjusteOrcamentoSemMudancaStatus(false);
      return false;
    }
    setStatusDialogOpen(true);
    origemAjusteRef.current = origem ?? pathnameAtualRef.current;
    const destino = `/equipamentos/${eq.id}/orcamento`;
    if (pathnameAtualRef.current !== destino) navigate(destino);
    return true;
  }

  /**
   * Fecha a página do ajuste e volta para onde a pessoa estava. Voltando aos detalhes, eles são
   * carregados de novo: depois de salvar mudaram, e num link direto nunca foram carregados.
   */
  function fecharPaginaAjuste() {
    const alvo = selecionado;
    setStatusDialogOpen(false);
    setAjusteOrcamentoSemMudancaStatus(false);
    const origem = origemAjusteRef.current;
    if (alvo?.id && origem === `/equipamentos/${alvo.id}`) {
      db.buscarEquipamento(alvo.id).then((eq) => abrirDetalhes(eq)).catch(() => navigate(origem));
      return;
    }
    if (pathnameAtualRef.current !== origem) navigate(origem);
  }

  // Link direto, voltar ou avançar até a página do ajuste: abre o ajuste dessa OS (com o PIN de sempre).
  const paginaAjusteAberta = statusDialogOpen && ajusteOrcamentoSemMudancaStatus;
  const paginaAjusteAbertaRef = useRef(false);
  paginaAjusteAbertaRef.current = paginaAjusteAberta;
  const idAjusteRotaAnterior = useRef<number | null>(null);
  useEffect(() => {
    const anterior = idAjusteRotaAnterior.current;
    idAjusteRotaAnterior.current = idAjusteRota;
    // A resposta (e o PIN pedido no meio) só vale enquanto a pessoa continua nesta rota.
    let ativo = true;
    if (idAjusteRota != null && !paginaAjusteAbertaRef.current) {
      const origem = `/equipamentos/${idAjusteRota}`;
      db.buscarEquipamento(idAjusteRota)
        .then(async (eq) => {
          if (!ativo) return;
          const aberto = await abrirAlterarOrcamento(eq, origem, () => ativo);
          if (!aberto && ativo) navigate(origem, { replace: true });
        })
        .catch((err) => {
          if (!ativo) return;
          showError("Equipamentos", "Abrir ajuste de orçamento", err);
          navigate("/equipamentos", { replace: true });
        });
    } else if (idAjusteRota == null && anterior != null && paginaAjusteAbertaRef.current) {
      // Saiu da página pelo navegador: o ajuste não salvo é descartado.
      setStatusDialogOpen(false);
      setAjusteOrcamentoSemMudancaStatus(false);
    }
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idAjusteRota]);

  async function abrirConsumosOrcamento(eq: Equipamento) {
    const liberado = await ensureSensitiveAccess({
      title: "Peças desta OS",
      description: "Informe o PIN para consultar e confirmar baixas pendentes.",
      permission: SENSITIVE_PERMISSIONS.STOCK_CONTROL,
    });
    if (!liberado || !eq.id) return;
    try {
      setSelecionado(eq);
      setConsumosDetalhes(await db.listarConsumosOrcamento(eq.id));
      setConsumosDialogOpen(true);
    } catch (cause) { showError("Equipamentos", "Peças da OS", cause); }
  }

  async function confirmarBaixaPendente() {
    if (!selecionado?.id || baixandoPendentes) return;
    setBaixandoPendentes(true);
    try {
      const quantidade = await db.baixarPecasPendentes(selecionado.id);
      setConsumosDetalhes(await db.listarConsumosOrcamento(selecionado.id));
      success("Equipamentos", `${quantidade} peça(s) baixada(s).`, "Estoque da OS");
    } catch (cause) { showError("Equipamentos", "Baixar peças pendentes", cause); }
    finally { setBaixandoPendentes(false); }
  }

  /**
   * Salva equipamento (criar ou editar). Valida que cliente foi vinculado.
   * Monta payload com dados do form + dados denormalizados do cliente.
   * Conecta-se a: useEquipamentos.criar/atualizar → db → Rust
   */
  async function onSubmit(data: EquipamentoFormData) {
    const sequenciaEdicao = fotoEdicaoSeq.current;
    const baselineFotos = editando ? baselineFotosRef.current : null;
    if (editando && (carregandoImagensFormulario || !baselineFotos || baselineFotos.equipamentoId !== editando.id)) {
      setErroImagens("As fotos ainda não foram carregadas com segurança. Recarregue as fotos antes de salvar.");
      return;
    }

    // Validar que um cliente foi vinculado
    if (!clienteVinculado) {
      setErroCliente("Selecione ou cadastre um cliente antes de salvar.");
      return;
    }
    setErroCliente(null);
    if (!tecnicoNovoEquipamento) {
      showError("Equipamentos", "Salvar equipamento", new Error("Escolha o técnico da verificação inicial. Marque os técnicos em Equipe e acessos."));
      return;
    }
    setSalvando(true);
    try {
      // Nome de exibição do cliente
      const nomeCliente = clienteVinculado.tipo_pessoa === "PJ"
        ? (clienteVinculado.nome_fantasia || clienteVinculado.razao_social || clienteVinculado.nome || "")
        : (clienteVinculado.nome || "");

      const acessoriosTexto = (data.acessorios || []).filter(Boolean).join(", ");

      const observacoesSemTecnico = removerTecnicoInicialDasObservacoes(data.observacoes || "");
      const emailTecnicoInicial = emailDoTecnico(tecnicoNovoEquipamento);
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
        data_entrada: editando?.data_entrada || todayLocalIsoDate(),
        observacoes: observacoesComTecnico || null,
        // Vínculo real com o cliente
        cliente_id: clienteVinculado.id || null,
        empresa_id: clienteVinculado.empresa_id || editando?.empresa_id || null,
        // Dados denormalizados para exibição rápida
        cliente_nome: nomeCliente,
        cliente_telefone: clienteVinculado.telefone || null,
        cliente_email: clienteVinculado.email || null,
        responsavel_contato_id: responsavelVinculado?.id || null,
        responsavel_nome: responsavelVinculado?.nome || null,
        responsavel_email: responsavelVinculado?.email || null,
        responsavel_telefone: responsavelVinculado?.telefone || null,
        atualizado_em: editando?.atualizado_em,
      };
      const imagensPayload: EquipamentoImagemInput[] = normalizarOrdemPorCategoria(imagensFormulario)
        .map(({ local_id, preview_url, ...imagem }) => imagem);
      const fotosAlteradas = editando
        ? !imagensPersistidasIguais(imagensFormulario, baselineFotos!.fotos)
        : imagensPayload.length > 0;
      const resultado = editando
        ? await atualizar(editando.id!, payload)
        : await criar(payload);

      if (!resultado.sucesso || !resultado.data?.id) {
        throw new Error(resultado.erro || "Não foi possível salvar o equipamento.");
      }
      const equipamentoSalvo = resultado.data;
      const equipamentoIdSalvo = equipamentoSalvo.id!;

      if (fotosAlteradas) {
        try {
          const expectedImageIds = editando
            ? baselineFotos!.fotos.flatMap((foto) => typeof foto.id === "number" ? [foto.id] : [])
            : [];
          const fotosSalvas = await db.substituirImagensEquipamento(
            equipamentoIdSalvo,
            imagensPayload,
            expectedImageIds,
          );
          if (editando && Array.isArray(fotosSalvas)) {
            const fotosPersistidas = normalizarOrdemPorCategoria(
              await Promise.all(fotosSalvas.map(imagemPersistidaParaDraft)),
            );
            if (fotoEdicaoSeq.current === sequenciaEdicao && fotoEdicaoEquipamentoId.current === editando.id) {
              baselineFotosRef.current = { equipamentoId: editando.id!, fotos: fotosPersistidas };
              setImagensFormulario(fotosPersistidas);
            }
          }
        } catch (err: any) {
          if (fotoEdicaoSeq.current === sequenciaEdicao) {
            setEditando(equipamentoSalvo);
            baselineFotosRef.current = null;
            if (!editando) {
              fotoEdicaoEquipamentoId.current = equipamentoIdSalvo;
            }
            setErroImagens(
              `O equipamento foi salvo, mas as fotos não foram salvas: ${err?.message || "falha ao persistir as fotos"}. Recarregue as fotos antes de tentar novamente.`,
            );
          }
          throw new Error(
            err?.message ||
            "O equipamento foi salvo, mas as fotos não puderam ser persistidas. Revise e tente novamente."
          );
        }
      }

      // A gravação iniciada para um formulário fechado pode terminar no banco,
      // mas nunca deve fechar ou substituir um formulário aberto depois dele.
      if (fotoEdicaoSeq.current !== sequenciaEdicao) return;

      if (!editando) {
        const liberadoEmail = await ensureSensitiveAccess({
          title: "Enviar ordem de entrada",
          description: "Informe o PIN para enviar a ordem de entrada por email ao cliente.",
        });
        if (fotoEdicaoSeq.current !== sequenciaEdicao) return;
        if (liberadoEmail) {
          async function enviarOrdemEntrada(email: string, nomeDestinatario: string, emailSalvo: boolean) {
            let erroEnvio: string | undefined;
            try {
              const retornoEmailEntrada = await EmailService.enviarOrdemEntrada({
                ...equipamentoSalvo,
                cliente_email: email,
                cliente_nome: nomeDestinatario,
              } as Equipamento);
              if (!retornoEmailEntrada.sucesso) erroEnvio = retornoEmailEntrada.erro || "Falha desconhecida.";
            } catch (cause) {
              erroEnvio = cause instanceof Error ? cause.message : String(cause);
            }
            if (erroEnvio) {
              showError("Equipamentos", "Enviar ordem de entrada", new Error(emailSalvo ? mensagemEnvioFalhouComEmailSalvo(erroEnvio) : erroEnvio));
            } else {
              success("Equipamentos", "Email de ordem de entrada enviado com sucesso.", "Enviar email");
            }
          }
          const recipient = resolveRecipient(equipamentoSalvo, "email");
          setEmailFlow({
            recipient,
            onConfirm: async (email, salvar) => {
              if (salvar) {
                try {
                  await saveRecipientAddress(equipamentoSalvo, "email", email);
                } catch (cause) {
                  showError("Equipamentos", "Salvar destinatário", cause);
                  return false;
                }
                // O cadastro mudou: recarrega para o próximo envio já usar o e-mail salvo.
                await atualizarEmSegundoPlano();
              }
              await enviarOrdemEntrada(email, recipient.nome, salvar);
            },
            onSkip: () => undefined,
          });
          setEmailDialogOpen(true);
        }
      }

      fotoEdicaoSeq.current += 1;
      fotoEdicaoEquipamentoId.current = null;
      baselineFotosRef.current = null;
      setDialogOpen(false);
      setImagensFormulario([]);
      setErroImagens(null);
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      if (fotoEdicaoSeq.current === sequenciaEdicao) showError("Equipamentos", "Salvar equipamento", err);
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
  async function handleConcluirVerificacao(dados: DadosVerificacao): Promise<boolean> {
    if (!selecionado) return false;
    // Total 0 só chega aqui em OS só de garantia, que sai aprovada: só quem aprova orçamento finaliza.
    const garantiaAprovada = dados.custo_total === 0;
    const liberado = await ensureSensitiveAccess({
      title: "Finalizar verificação",
      description: garantiaAprovada
        ? "OS só de garantia vai direto para Aprovado. Informe o PIN de quem aprova orçamentos."
        : "Informe o PIN para salvar orçamento, prazo de aprovação e disparar comunicações automáticas.",
      anyPermission: [SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES],
    });
    if (!liberado) return false;

    async function finalizar(eq: Equipamento): Promise<boolean> {
      setSalvando(true);
      try {
        const resultado = await finalizarVerificacao(eq, dados);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível finalizar a verificação.");
        }
        await recarregar();
        fecharPaginaVerificacao();
        const resumoCanais = mensagemResultadoCanais(resultado);
        if (resumoCanais) {
          success("Equipamentos", resumoCanais, "Finalizar verificação");
        }
        if (resultado.avisos?.length) {
          warning("Equipamentos", resultado.avisos.join("\n"));
        }
        if (resultado.envioManual) setEnvioManual(resultado.envioManual);
        return true;
      } catch (err: any) {
        showError("Equipamentos", "Finalizar verificação", err);
        return false;
      } finally {
        setSalvando(false);
      }
    }

    let precisaContato = false;
    try {
      const dest = await db.obterDestinatarioOrcamento(selecionado.id!);
      precisaContato = !!dest?.precisaContato;
    } catch (err) {
      showError("Equipamentos", "Finalizar verificação", err);
      return false;
    }

    if (precisaPerguntarQuemRecebeOrcamento(precisaContato, garantiaAprovada)) {
      setQuemRecebe({
        eq: selecionado,
        sugestao: {
          nome: selecionado.cliente_nome || "",
          telefone: selecionado.cliente_telefone || "",
          email: selecionado.cliente_email || "",
        },
        continuar: async (eqAtualizado) => { await finalizar(eqAtualizado); },
      });
      return false;
    }
    return finalizar(selecionado);
  }

  /** Gera nova senha de portal para o envio manual aberto e atualiza o diálogo. */
  async function gerarNovaSenhaDoEnvioManual(): Promise<EnvioManualOrcamento | null> {
    if (!envioManual) return null;
    const [eq, verificacao] = await Promise.all([
      db.buscarEquipamento(envioManual.equipamentoId),
      db.buscarVerificacao(envioManual.equipamentoId),
    ]);
    if (!verificacao) throw new Error("Verificação não encontrada para gerar nova senha.");
    const novo = await gerarNovaSenhaEnvioManual(eq, verificacao);
    if (novo) setEnvioManual(novo);
    return novo;
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
    });
    if (!liberado) return;

    async function executarComEmail(email: string | undefined, nomeDestinatario?: string, emailSalvo = false): Promise<boolean> {
      setSalvando(true);
      try {
        const resultado = await marcarComoPronto(eq, email, nomeDestinatario);
        if (!resultado.sucesso) {
          throw new Error(resultado.erro || "Não foi possível marcar o equipamento como pronto.");
        }
        await recarregar();
        const resumoCanais = mensagemResultadoCanais(resultado);
        if (emailSalvo && resultado.canais?.email && !resultado.canais.email.enviado) {
          showError("Equipamentos", "Marcar como pronto", new Error([mensagemEnvioFalhouComEmailSalvo(resultado.canais.email.erro), ...resumoCanais.split("\n").filter((linha) => linha.startsWith("WhatsApp"))].join("\n")));
        } else if (resumoCanais) {
          success("Equipamentos", resumoCanais, "Marcar como pronto");
        }
        return true;
      } catch (err: any) {
        console.error("Erro ao marcar pronto:", err);
        showError("Equipamentos", "Marcar como pronto", err);
        if (emailSalvo) await atualizarEmSegundoPlano();
        return false;
      } finally {
        setSalvando(false);
      }
    }

    const recipient = resolveRecipient(eq, "email");
    setEmailFlow({
      recipient,
      onConfirm: async (email, salvar) => {
        if (salvar) {
          try {
            await saveRecipientAddress(eq, "email", email);
          } catch (cause) {
            showError("Equipamentos", "Salvar destinatário", cause);
            return false;
          }
        }
        await executarComEmail(email, recipient.nome, salvar);
      },
      onSkip: async () => { await executarComEmail(""); },
    });
    setEmailDialogOpen(true);
  }

  function iniciarConfirmacaoStatus() {
    const mostraOrcamento = (novoStatus === "AGUARDANDO_APROVACAO" && selecionado && !reabreOrcamentoSemAjuste(selecionado.status, novoStatus))
      || ajusteOrcamentoSemMudancaStatus;
    const enviandoParaAprovacao = novoStatus === "AGUARDANDO_APROVACAO"
      && !!selecionado
      && !reabreOrcamentoSemAjuste(selecionado.status, novoStatus);
    if (mostraOrcamento && !valorOrcamentoValido) return;
    if (enviandoParaAprovacao && !totalOrcamentoAprovacaoValido(valorOrcamentoRef.current)) {
      warning("Equipamentos", osSomenteGarantia(servicosAjuste)
        ? "OS só de garantia não envia orçamento para aprovação de valor."
        : "Informe um valor de orçamento maior que zero.");
      return;
    }
    if (ajusteOrcamentoSemMudancaStatus && !totalOrcamentoAjusteValido(valorOrcamentoRef.current, osSomenteGarantia(servicosAjuste), selecionado?.status, selecionado?.valor_orcamento)) {
      warning("Equipamentos", mensagemAjusteTotalZero(selecionado?.status, selecionado?.valor_orcamento));
      return;
    }
    if ((novoStatus === "AGUARDANDO_APROVACAO" || ajusteOrcamentoSemMudancaStatus) && verificacaoAjusteOrcamento) {
      if (ajusteOrcamentoSemMudancaStatus && vaiAutoAprovarOsGarantia(selecionado?.status, osSomenteGarantia(servicosAjuste), valorOrcamentoRef.current)) {
        void confirmarMudancaStatus(false);
        return;
      }
      const servicosOriginal: ServicoNecessario[] = [];
      try {
        servicosOriginal.push(...JSON.parse(verificacaoAjusteOrcamento.servicos_necessarios || "[]") as ServicoNecessario[]);
      } catch {}
      const totalOriginal = servicosOriginal.reduce((sum, s) => sum + (Number(s.valor) || 0), 0);
      const totalNovo = servicosAjuste.reduce((sum, s) => sum + (Number(s.valor) || 0), 0);

      const pecasTotal = [...pecasParaOrcamento(servicosAjuste), ...pecasLegadasAjuste]
        .reduce((sum, p) => sum + p.valorTotal, 0);
      const calculado = totalNovo + pecasTotal;

      const digitado = valorOrcamentoRef.current;
      if (Math.abs(calculado - digitado) > 0.001) {
        setConfirmProps({
          title: `Valor digitado ${formatCurrency(digitado)} diferente da soma ${formatCurrency(calculado)}`,
          description: `Sim grava a soma dos itens (${formatCurrency(calculado)}). Não grava o valor digitado (${formatCurrency(digitado)}).`,
          confirmLabel: "Sim",
          cancelLabel: "Não",
          variant: "default",
          cancelVariant: "destructive",
          onConfirm: () => {
            setValorOrcamento(calculado);
            setConfirmOpen(false);
            setTimeout(() => iniciarConfirmacaoStatus(), 0);
          },
          onCancel: () => {
            setConfirmOpen(false);
            void confirmarMudancaStatus(true);
          },
        });
        setConfirmOpen(true);
        return;
      }

      const originalVigente = valorOrcamentoAnterior ?? totalOriginal;
      const novoValor = digitado;
      const diferenca = novoValor - originalVigente;
      const lines = [
        "Revise as alterações antes de confirmar:",
        "",
        ...servicosAjuste.map((s) => `• ${s.descricao || "(sem nome)"}: ${formatCurrency(Number(s.valor || 0))}`),
        "",
        `Valor original: ${formatCurrency(originalVigente)}`,
        `Novo valor: ${formatCurrency(novoValor)}`,
        `Diferença: ${formatCurrency(diferenca)}`,
      ];
      setConfirmProps({
        title: "Resumo do Ajuste de Orçamento",
        description: lines.join("\n"),
        onConfirm: () => {
          setConfirmOpen(false);
          void confirmarMudancaStatus(false);
        },
        onCancel: () => setConfirmOpen(false),
      });
      setConfirmOpen(true);
      return;
    }
    void confirmarMudancaStatus(false);
  }

  async function abrirDialogoAprovacao(eq: Equipamento, decisaoInicial: "aprovar" | "reprovar") {
    const liberado = await ensureSensitiveAccess({
      title: decisaoInicial === "aprovar" ? "Aprovar orçamento" : "Reprovar orçamento",
      description: decisaoInicial === "aprovar"
        ? "Informe o PIN para registrar a decisão do cliente sobre este orçamento."
        : "Informe o PIN para registrar a reprovação do orçamento pelo cliente.",
      anyPermission: [SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES],
    });
    if (!liberado) return;

    setSelecionado(eq);
    setPagamentoAprovacaoError(null);
    setPagamentoAprovacaoLoading(true);
    try {
      const verificacao = await db.buscarVerificacao(eq.id!);
      const servicos = normalizarServicosOrcamento(JSON.parse(verificacao?.servicos_necessarios || "[]") as ServicoNecessario[]);
      setServicosAprovacao(servicos);
      setTotalOrcamentoAprovacao(servicos.length === 0
        ? (eq.valor_orcamento != null && eq.valor_orcamento > 0
          ? eq.valor_orcamento
          : verificacao?.custo_total != null && verificacao.custo_total > 0
            ? verificacao.custo_total
            : eq.valor_orcamento ?? verificacao?.custo_total)
        : verificacao?.custo_total);
      setProdutosAprovacao(await carregarProdutosOrcamento());
      setTodosServicosAprovados(decisaoInicial === "reprovar" ? false : null);
      setIdsAprovados([]);
      const decisaoCliente = await db.obterDecisaoOrcamento(eq.id!);
      respostaClienteVistaRef.current = decisaoCliente && !decisaoCliente.encerradaMotivo
        ? decisaoCliente.resposta?.id ?? 0
        : 0;
      const respostaPendente = decisaoCliente && !decisaoCliente.encerradaMotivo ? decisaoCliente.resposta : null;
      setRespostaClienteDecisao(
        respostaPendente && !respostaPendente.aplicadaEm && respostaPendente.decisao !== "DESFEITA"
          ? respostaPendente.decisao
          : null,
      );
      setMotivoDivergencia("");
      setPagamentoAprovacaoInicial(verificacao?.forma_pagamento_codigo ? {
        codigo: verificacao.forma_pagamento_codigo,
        detalhe: verificacao.forma_pagamento_detalhe || null,
      } : null);
      setSelecaoServicosOpen(true);
    } catch (cause) {
      showError("Equipamentos", "Carregar pagamento", cause);
    } finally {
      setPagamentoAprovacaoLoading(false);
    }
  }

  const decisaoDivergeDoCliente = respostaClienteDecisao != null
    && todosServicosAprovados !== null
    && (respostaClienteDecisao === "APROVAR") !== decisaoAprovada;
  const motivoDivergenciaValido = motivoDivergencia.trim().length >= 5;

  async function confirmarAprovacao(pagamento: FormaPagamento): Promise<boolean> {
    if (!selecionado?.id) {
      setPagamentoAprovacaoError("Não foi possível identificar o equipamento selecionado.");
      return false;
    }
    if (!selecionado.empresa_id) {
      setPagamentoAprovacaoError("Este equipamento é um cadastro legado sem empresa vinculada. Vincule o cliente à empresa antes de aprovar o orçamento.");
      return false;
    }
    if (!selecionado.atualizado_em) {
      setPagamentoAprovacaoError("A versão atual do orçamento não está disponível. Feche, atualize a lista e tente novamente.");
      return false;
    }
    if (decisaoDivergeDoCliente && !motivoDivergenciaValido) {
      setPagamentoAprovacaoError("O cliente respondeu de outra forma. Informe o motivo da divergência (mínimo de 5 caracteres).");
      return false;
    }
    setPagamentoAprovacaoLoading(true);
    try {
      await db.aprovarOrcamento({
        empresa_id: selecionado.empresa_id,
        equipamento_id: selecionado.id,
        expected_updated_em: selecionado.atualizado_em,
        pagamento,
        servicos_aprovados: idsAprovados,
        aprovado: decisaoAprovada,
        resposta_esperada_id: respostaClienteVistaRef.current,
        ...(decisaoDivergeDoCliente ? { motivo_divergencia: motivoDivergencia.trim() } : {}),
      });
      await recarregar();
      setPagamentoAprovacaoError(null);
      const servicosReprovados = servicosAprovacao
        .filter((servico) => !idsAprovados.includes(servico.id))
        .map((servico) => servico.descricao);
      const detalheReprovacaoParcial = servicosReprovados.length > 0
        ? ` Serviços não aprovados: ${servicosReprovados.join(", ")}.`
        : "";
      success("Equipamentos", decisaoAprovada
        ? servicosAprovacao.length
          ? `Serviços aprovados. As peças disponíveis foram baixadas; confira faltas em Peças da OS.${detalheReprovacaoParcial}`
          : "Orçamento aprovado sem serviços detalhados e sem baixa de estoque."
        : "Orçamento reprovado sem baixa de estoque.", "Decisão do cliente");
      return true;
    } catch (cause) {
      setPagamentoAprovacaoError(String(cause));
      return false;
    } finally {
      setPagamentoAprovacaoLoading(false);
    }
  }

  function pedirEscolhaAjuste(variante: "aprovado" | "pendente", analise: AnaliseAjusteOrcamento) {
    return new Promise<OpcoesAjusteOrcamento | null>((resolve) => {
      escolhaAjusteResolver.current = resolve;
      setEscolhaAjuste({ variante, analise });
    });
  }

  function responderEscolhaAjuste(opcoes: OpcoesAjusteOrcamento | null) {
    escolhaAjusteResolver.current?.(opcoes);
    escolhaAjusteResolver.current = null;
    setEscolhaAjuste(null);
  }

  async function confirmarMudancaStatus(divergencia = false) {
    if (!selecionado || (!novoStatus && !ajusteOrcamentoSemMudancaStatus)) return;
    if (servicosAjuste.some((s) => !validarPecas(s.pecas ?? []))) {
      warning("Equipamentos", "Informe quantidade inteira positiva e preço válido para as peças.");
      return;
    }
    const totalAtual = valorOrcamentoRef.current;
    const mostraOrcamento = (novoStatus === "AGUARDANDO_APROVACAO" && !reabreOrcamentoSemAjuste(selecionado.status, novoStatus))
      || ajusteOrcamentoSemMudancaStatus;
    const enviandoParaAprovacao = novoStatus === "AGUARDANDO_APROVACAO"
      && !reabreOrcamentoSemAjuste(selecionado.status, novoStatus);
    if (mostraOrcamento && (!valorOrcamentoValido || !Number.isFinite(totalAtual))) {
      warning("Equipamentos", "Informe um valor de orçamento válido.");
      return;
    }
    if (enviandoParaAprovacao && !totalOrcamentoAprovacaoValido(totalAtual)) {
      warning("Equipamentos", osSomenteGarantia(servicosAjuste)
        ? "OS só de garantia não envia orçamento para aprovação de valor."
        : "Informe um valor de orçamento maior que zero.");
      return;
    }
    if (ajusteOrcamentoSemMudancaStatus && !totalOrcamentoAjusteValido(totalAtual, osSomenteGarantia(servicosAjuste), selecionado.status, selecionado.valor_orcamento)) {
      warning("Equipamentos", mensagemAjusteTotalZero(selecionado.status, selecionado.valor_orcamento));
      return;
    }
    if (correcaoStatus && novoStatus === "AGUARDANDO_APROVACAO" && ["APROVADO", "REPROVADO"].includes(selecionado.status)) {
      warning("Equipamentos", "Para reabrir um orçamento já decidido use “Corrigir decisão do orçamento”: ela desfaz pagamento e estoque junto.");
      return;
    }
    if (correcaoStatus && !motivoCorrecaoStatus.trim()) {
      warning("Equipamentos", "Informe o motivo da correção antes de continuar.");
      return;
    }
    const autoAprovaGarantia = vaiAutoAprovarOsGarantia(
      selecionado.status,
      osSomenteGarantia(servicosAjuste),
      totalAtual,
    );
    if (autoAprovaGarantia && !garantiaConfirmadaRef.current) {
      setConfirmProps({
        title: TITULO_CONFIRMAR_OS_GARANTIA,
        description: MENSAGEM_CONFIRMAR_OS_GARANTIA,
        confirmLabel: LABEL_CONFIRMAR_OS_GARANTIA,
        cancelLabel: "Cancelar",
        onConfirm: () => {
          garantiaConfirmadaRef.current = true;
          setConfirmOpen(false);
          void confirmarMudancaStatus(divergencia);
        },
        onCancel: () => {
          garantiaConfirmadaRef.current = false;
        },
      });
      setConfirmOpen(true);
      return;
    }
    // Só campos efetivamente editados seguem no comando. Retirada comum não regrava valores.
    const valorOrcamentoStatus = mostraOrcamento || novoStatus === "AGUARDANDO_APROVACAO"
      ? totalAtual || undefined : undefined;
    const prazoStatus = mostraOrcamento || novoStatus === "AGUARDANDO_APROVACAO"
      ? prazoAprovacao || undefined : undefined;
    const valorFinalStatus = novoStatus === "ENTREGUE" && acordoExcecaoEntrega ? valorFinal : undefined;
    // Na conferência de acesso, total 0,00 editado (garantia) também conta como valor informado.
    const precisaLiberacao = correcaoStatus || statusExigeAcessoSensivel(
      novoStatus,
      mostraOrcamento ? totalAtual : valorOrcamentoStatus,
      prazoStatus,
      valorFinalStatus,
    );
    const liberado = await ensureSensitiveAccess({
      title: autoAprovaGarantia ? "Confirmar OS só de garantia" : "Confirmar mudança de status",
      description: autoAprovaGarantia
        ? "OS só de garantia vai direto para Aprovado. Informe o PIN de quem aprova orçamentos."
        : "Informe o PIN para aplicar esta transição do equipamento.",
      ...(precisaLiberacao
        ? (autoAprovaGarantia
          || (!correcaoStatus && ajusteOrcamentoSemMudancaStatus && orcamentoEmElaboracao(selecionado.status))
          || transicaoElaboraOrcamento(selecionado.status, novoStatus, correcaoStatus, valorFinalStatus)
          ? { anyPermission: [SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES] }
          : { permission: SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS })
        : {}),
    });
    if (!liberado) {
      garantiaConfirmadaRef.current = false;
      return;
    }

    // Alterar orçamento já aprovado ou já respondido no portal: o operador escolhe o que fazer.
    let opcoesAjuste: OpcoesAjusteOrcamento | undefined;
    if (ajusteOrcamentoSemMudancaStatus && verificacaoAjusteOrcamento && selecionado.id) {
      try {
        const analise = await db.analisarAjusteOrcamento(selecionado.id);
        const aprovado = orcamentoJaAprovado(selecionado.status);
        const variante = aprovado ? "aprovado" : analise.respostaPendente ? "pendente" : null;
        if (variante && orcamentoMudou(verificacaoAjusteOrcamento, servicosAjuste, totalAtual)) {
          const escolha = await pedirEscolhaAjuste(variante, analise);
          if (!escolha) {
            garantiaConfirmadaRef.current = false;
            return;
          }
          opcoesAjuste = escolha;
        }
      } catch (err) {
        showError("Equipamentos", "Conferir o portal antes de salvar", err);
        garantiaConfirmadaRef.current = false;
        return;
      }
      if (opcoesAjuste?.modoAprovado === "SEM_NOVA_APROVACAO") {
        if (!formaPagamentoAjuste) {
          warning("Equipamentos", "Escolha a forma de pagamento antes de salvar o orçamento aprovado.");
          garantiaConfirmadaRef.current = false;
          return;
        }
        if (formaPagamentoAjuste === "OUTRO" && !detalhePagamentoAjuste.trim()) {
          warning("Equipamentos", "Descreva a forma de pagamento escolhida em Outro.");
          garantiaConfirmadaRef.current = false;
          return;
        }
      }
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
        const expectedImageIds = imagensAtuais.flatMap((foto) => typeof foto.id === "number" ? [foto.id] : []);
        try {
          await db.substituirImagensEquipamento(
            selecionado.id!,
            [...imagensEntradaPayload, ...imagensSaidaPayload],
            expectedImageIds,
          );
        } catch (err: any) {
          setErroImagensSaidaEntrega(
            `${err?.message || "falha ao persistir as fotos"}. Recarregue as fotos antes de salvar novamente.`,
          );
          throw new Error(
            err?.message ||
            "As fotos não puderam ser persistidas. Recarregue as fotos antes de tentar novamente.",
          );
        }
      }

      let versaoAtual = selecionado.atualizado_em;
      let portalAjuste: PortalAjusteInfo | undefined;
      if ((novoStatus === "AGUARDANDO_APROVACAO" || ajusteOrcamentoSemMudancaStatus) && verificacaoAjusteOrcamento && !reabreOrcamentoSemAjuste(selecionado.status, novoStatus)) {
        const profileId = sensitiveStatus?.active_profile_id;
        if (!profileId) {
          throw new Error("Perfil autorizado não encontrado para ajustar o orçamento.");
        }
        const pecas = [...pecasParaOrcamento(servicosAjuste), ...pecasLegadasAjuste];
        const pedeNovaAprovacao = opcoesAjuste?.modoAprovado === "NOVA_APROVACAO";
        const resultado = await db.atualizarServicosVerificacao(
          {
            equipamento_id: selecionado.id!,
            empresa_id: selecionado.empresa_id,
            servicos: servicosAjuste,
            pecas,
            custo_total: totalAtual,
            observacoes: observacoesAjuste,
            ...(orcamentoJaAprovado(selecionado.status) && formaPagamentoAjuste && !pedeNovaAprovacao
              ? {
                forma_pagamento_codigo: formaPagamentoAjuste,
                forma_pagamento_detalhe: formaPagamentoAjuste === "OUTRO" ? detalhePagamentoAjuste.trim() : undefined,
              }
              : {}),
            divergence: divergencia,
            // Escolher "ajuste sem nova aprovação" é a confirmação de que o cliente concordou.
            cliente_aprovou_alteracao: opcoesAjuste?.modoAprovado === "SEM_NOVA_APROVACAO",
            expected_updated_em: selecionado.atualizado_em,
            ...((opcoesAjuste || autoAprovaGarantia)
              ? { opcoes: { ...opcoesAjuste, ...(autoAprovaGarantia ? { confirmarGarantia: true } : {}) } }
              : {}),
          },
          profileId,
        );
        if (!ajusteOrcamentoSemMudancaStatus) versaoAtual = (await db.buscarEquipamento(selecionado.id!)).atualizado_em;
        portalAjuste = resultado?.portal;
      }

      if (ajusteOrcamentoSemMudancaStatus) {
        let portalProrrogacao: PortalAjusteInfo | undefined;
        const prazoMudou = selecionado.status === "AGUARDANDO_APROVACAO"
          && !!prazoAprovacao
          && prazoAprovacao !== (selecionado.prazo_aprovacao || "").slice(0, 10);
        if (prazoMudou) {
          try {
            const equipamentoId = selecionado.id!;
            const prorrogar = async (confirmarRespostaPendente?: boolean) => {
              const versao = (await db.buscarEquipamento(equipamentoId)).atualizado_em;
              if (!versao) throw new Error("Versão do equipamento não encontrada.");
              return db.prorrogarPrazoOrcamento({
                equipamentoId,
                novoPrazo: prazoAprovacao,
                expectedUpdatedEm: versao,
                ...(confirmarRespostaPendente ? { confirmarRespostaPendente: true } : {}),
              });
            };
            let resultadoProrrogacao = await prorrogar();
            if (!resultadoProrrogacao.prorrogado) {
              const confirmado = await confirmarComOperador(
                "O cliente já respondeu",
                "Prorrogar anula a resposta pendente. Continuar?",
                "Prorrogar",
              );
              if (confirmado) {
                resultadoProrrogacao = await prorrogar(true);
              } else {
                warning("Equipamentos", "Orçamento salvo. O prazo não foi prorrogado.");
              }
            }
            if (resultadoProrrogacao.prorrogado) portalProrrogacao = resultadoProrrogacao.portal;
          } catch (err) {
            const detalhe = err instanceof Error ? err.message : String(err);
            warning("Equipamentos", `Orçamento salvo, mas o prazo não foi prorrogado: ${detalhe}`);
          }
        }
        await recarregar();
        fecharPaginaAjuste();
        success(
          "Equipamentos",
          ["Orçamento atualizado.", portalAjuste?.mensagem, portalProrrogacao?.mensagem].filter(Boolean).join(" "),
          "Alterar orçamento",
        );
        if (portalAjuste?.aviso) warning("Equipamentos", portalAjuste.aviso);
        if (portalProrrogacao?.aviso) warning("Equipamentos", portalProrrogacao.aviso);
        return;
      }

      const resultado = await atualizarStatus(
        selecionado.id!,
        novoStatus,
        valorOrcamentoStatus,
        prazoStatus,
        valorFinalStatus,
        versaoAtual,
        correcaoStatus ? motivoCorrecaoStatus.trim() : undefined,
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
    finally {
      setSalvando(false);
      garantiaConfirmadaRef.current = false;
    }
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

  function removerImagemSaidaEntrega(imagem: EquipamentoImagemDraft) {
    setImagensSaidaEntrega((estadoAtual) =>
      normalizarOrdemPorCategoria(estadoAtual.filter((img) => img.local_id !== imagem.local_id))
    );
    setErroImagensSaidaEntrega(null);
  }

  function atualizarLegendaImagemSaidaEntrega(imagem: EquipamentoImagemDraft, value: string) {
    setImagensSaidaEntrega((estadoAtual) =>
      estadoAtual.map((img) => (
        img.local_id === imagem.local_id
          ? { ...img, observacao: value.slice(0, 280) }
          : img
      ))
    );
  }

  async function exportarImagemEquipamento(imagem: EquipamentoImagemDraft) {
    try {
      const caminho = await invoke<string>("salvar_imagem_equipamento", {
        storagePath: imagem.storage_path,
        fileName: imagem.filename,
        mimeType: imagem.mime_type,
      });
      success("Equipamentos", `Imagem exportada com sucesso. Arquivo: ${caminho}`, "Exportar imagem");
    } catch (err: any) {
      console.error("Erro ao exportar imagem do equipamento:", err);
      showError("Equipamentos", "Exportar imagem", err);
    }
  }

  /** Pergunta ao operador e devolve a resposta (usa o diálogo de confirmação da página). */
  function confirmarComOperador(title: string, description: string, confirmLabel: string): Promise<boolean> {
    return new Promise((resolve) => {
      setConfirmProps({
        title,
        description,
        confirmLabel,
        cancelLabel: "Cancelar",
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
      setConfirmOpen(true);
    });
  }

  /**
   * Reenvio manual de WhatsApp. A tela só informa equipamento e tipo; o backend decide o texto,
   * evita duplicidade e pede confirmação quando o envio anterior tem resultado incerto.
   */
  async function reenviarOrcamentoInformativo(eq: Equipamento) {
    let verificacao: Awaited<ReturnType<typeof db.buscarVerificacao>>;
    try {
      verificacao = await db.buscarVerificacao(eq.id!);
    } catch (err) {
      showError("Equipamentos", "Enviar WhatsApp", err);
      return;
    }
    if (!verificacao) {
      warning("Equipamentos", "Verificação não encontrada; o orçamento não foi enviado.");
      return;
    }

    let envio = await enviarOrcamentoAoCliente(eq, verificacao, { reenvioManual: true, enviarEmail: false });
    if (envio.canais.whatsapp.estado === "REQUER_CONFIRMACAO") {
      const confirmado = await confirmarComOperador(
        "Enviar de novo?",
        envio.canais.whatsapp.erro || "O resultado do envio anterior é incerto: a mensagem pode já ter chegado ao cliente.",
        "Enviar mesmo assim",
      );
      if (!confirmado) return;
      envio = await enviarOrcamentoAoCliente(eq, verificacao, { reenvioManual: true, enviarEmail: false, confirmarIncerto: true, preparo: envio.preparo });
    }

    const wa = envio.canais.whatsapp;
    if (envio.envioManual) setEnvioManual(envio.envioManual);
    if (wa.enviado) {
      success("Equipamentos", "Mensagem aceita pelo provedor de WhatsApp. A entrega não é confirmada neste momento.", "WhatsApp");
    } else if (wa.erro && ehErroPrazoVencido(wa.erro)) {
      await prorrogarPrazoEEnviar(eq, envio.preparo);
      return;
    } else if (wa.estado === "INCERTA") {
      warning("Equipamentos", wa.erro || "O provedor não confirmou o envio. Confira antes de tentar de novo.");
    } else if (!envio.envioManual || !whatsappNaoConfigurado(wa.erro)) {
      showError("Equipamentos", "Enviar WhatsApp", new Error(wa.erro || "Falha ao enviar WhatsApp."));
    }
    if (envio.avisos.length) warning("Equipamentos", envio.avisos.join("\n"));
  }

  async function prorrogarPrazoEEnviar(eq: Equipamento, preparo?: PreparoAcessoPortal | null) {
    const liberado = await ensureSensitiveAccess({
      title: "Prorrogar prazo e enviar",
      description: "Informe o PIN para prorrogar o prazo de aprovação e reenviar o orçamento ao cliente.",
      anyPermission: [SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS, SENSITIVE_PERMISSIONS.PREPARE_QUOTES],
    });
    if (!liberado) return;
    const novoPrazo = sugerirNovoPrazo();
    const dataBr = formatarDataIso(novoPrazo).slice(0, 5);
    const confirmado = await confirmarComOperador(
      "Prazo do orçamento vencido",
      `O prazo de aprovação já terminou. Prorrogar até ${dataBr} e enviar o orçamento?`,
      `Prorrogar até ${dataBr} e enviar`,
    );
    if (!confirmado) return;
    setSalvando(true);
    try {
      const r = await prorrogarEEnviar(eq, novoPrazo, () =>
        confirmarComOperador(
          "Resposta pendente",
          "O cliente já respondeu. Prorrogar anula a resposta pendente. Continuar?",
          "Continuar",
        ),
        { preparo },
      );
      if (r.respostaPendenteRecusada) return;
      if (r.envioManual) setEnvioManual(r.envioManual);
      const etapas = [
        r.prorrogado ? "Prazo prorrogado." : "Prazo não prorrogado.",
        ...(r.prorrogado ? [r.publicado ? "Orçamento publicado no portal." : "Orçamento não publicado no portal."] : []),
        ...(r.whatsapp ? [r.whatsapp.enviado ? "WhatsApp: enviado." : `WhatsApp: não enviado${r.whatsapp.erro ? ` (${r.whatsapp.erro})` : "."}`] : []),
      ];
      if (r.prorrogado) success("Equipamentos", etapas.join("\n"), "Prorrogar e enviar");
      if (r.avisos.length) warning("Equipamentos", r.avisos.join("\n"));
      await recarregar();
    } catch (err) {
      showError("Equipamentos", "Prorrogar e enviar", err);
    } finally {
      setSalvando(false);
    }
  }

  async function reenviarWhatsApp(eq: Equipamento, tipo: "orcamento_informativo" | "equipamento_pronto") {
    if (tipo === "orcamento_informativo") {
      await reenviarOrcamentoInformativo(eq);
      return;
    }
    let resultado = await WhatsAppService.solicitarEnvio(eq.id!, tipo, { reenvioManual: true });
    if (resultado.requerConfirmacao) {
      const confirmado = await confirmarComOperador(
        "Enviar de novo?",
        resultado.mensagem || "O resultado do envio anterior é incerto: a mensagem pode já ter chegado ao cliente.",
        "Enviar mesmo assim",
      );
      if (!confirmado) return;
      resultado = await WhatsAppService.solicitarEnvio(eq.id!, tipo, { reenvioManual: true, confirmarIncerto: true });
    }
    if (resultado.sucesso) {
      success(
        "Equipamentos",
        resultado.enfileirada
          ? "Mensagem na fila de envio. O resultado aparece no histórico de comunicações."
          : "Mensagem aceita pelo provedor de WhatsApp. A entrega não é confirmada neste momento.",
        "WhatsApp",
      );
      return;
    }
    if (whatsappNaoConfigurado(resultado.erro)) {
      console.warn("[WhatsApp] Integração não configurada. Fluxo segue com envio manual.");
      return;
    }
    if (resultado.estado === "INCERTA") {
      warning("Equipamentos", resultado.erro || "O provedor não confirmou o envio. Confira antes de tentar de novo.");
      return;
    }
    showError("Equipamentos", "Enviar WhatsApp", new Error(resultado.erro));
  }

  /** Envia orçamento manualmente via WhatsApp (texto da versão congelada do orçamento). */
  async function enviarWhatsAppOrcamento(eq: Equipamento) {
    const liberado = await ensureSensitiveAccess({
      title: "Enviar orçamento por WhatsApp",
      description: "Informe o PIN para disparar manualmente a mensagem de orçamento ao cliente.",
    });
    if (!liberado) return;
    await reenviarWhatsApp(eq, "orcamento_informativo");
  }

  /** Constrói o orçamento para inspeção sem persistir o arquivo. */
  async function gerarOrcamentoPdf(eq: Equipamento) {
    try {
      setSalvando(true);
      const verif = await db.buscarVerificacao(eq.id!);
      if (!verif) { warning("Equipamentos", "Nenhuma verificação técnica encontrada para este equipamento."); return; }
      const artifact = await PdfService.construirOrcamentoAjustado(eq, verif);
      if (!artifact) return;
      setPdfPreview({
        artifact,
        tipo: "orcamento",
        equipamento: eq,
        verificacao: verif,
        prazoMin: PRAZO_EXECUCAO_PADRAO.minDiasUteis,
        prazoMax: PRAZO_EXECUCAO_PADRAO.maxDiasUteis,
      });
    } catch (err) {
      console.error("Erro ao gerar orçamento PDF:", err);
      showError("Equipamentos", "Gerar orçamento PDF", err);
    } finally {
      setSalvando(false);
    }
  }

  /** Constrói a ordem de serviço para inspeção sem persistir o arquivo. */
  async function gerarOrdemServicoPdf(eq: Equipamento) {
    try {
      setSalvando(true);
      setPdfPreview({ artifact: await PdfService.construirOrdemServico(eq), tipo: "ordem", equipamento: eq });
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
      setPdfPreview({
        artifact: await PdfService.construirRelatorioStatus(
          eq,
          eq.id === selecionado?.id ? historicoDetalhes : undefined,
        ),
        tipo: "relatorio",
        equipamento: eq,
      });
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
    });
    if (!liberado) return;
    await reenviarWhatsApp(eq, "equipamento_pronto");
  }

  // ─── Botões de ação contextuais por status ────────────

  /**
   * Renderiza botões de ação contextuais por status na tabela.
   * Cada status tem ações específicas (ex: RECEBIDO → "Iniciar Verificação").
   * Conecta-se a: acaoRapida, abrirVerificacao, abrirMudarStatus, handleMarcarPronto, WhatsApp
   */
  function renderAcoes(eq: Equipamento, naPagina = false) {
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
      label: "Editar Equipamento",
      icon: <Edit className="h-3.5 w-3.5" />,
      variant: "outline",
      onClick: () => abrirEditar(eq),
    };
    const acaoOrcamentoPdf: PriorityAction = {
      id: "orcamento_pdf",
      label: "Orçamento PDF",
      icon: <FileDown className="h-3.5 w-3.5" />,
      onClick: () => void gerarOrcamentoPdf(eq),
      disabled: salvando,
    };
    const acaoAlterarOrcamento: PriorityAction = {
      id: "alterar_orcamento",
      label: "Alterar Orçamento",
      icon: <DollarSign className="h-3.5 w-3.5" />,
      variant: "outline",
      onClick: () => void abrirAlterarOrcamento(eq),
    };
    const acaoPecasOs: PriorityAction = {
      id: "pecas_os",
      label: "Peças da OS",
      icon: <PackageCheck className="h-3.5 w-3.5" />,
      variant: "outline",
      onClick: () => void abrirConsumosOrcamento(eq),
    };
    const acaoCorrigirStatus: PriorityAction = {
      id: "corrigir_status",
      label: "Corrigir Status",
      icon: <History className="h-3.5 w-3.5" />,
      variant: "outline",
      onClick: () => void abrirCorrecaoStatus(eq),
    };
    const acaoCorrigirDecisao: PriorityAction = {
      id: "corrigir_decisao",
      label: "Corrigir decisão do orçamento",
      icon: <RotateCcw className="h-3.5 w-3.5" />,
      variant: "outline",
      onClick: () => void abrirCorrigirDecisao(eq),
    };
    const acaoExcluir: PriorityAction = {
      id: "excluir",
      label: "Excluir",
      icon: <Trash2 className="h-3.5 w-3.5" />,
      variant: "ghost",
      className: "text-destructive",
      onClick: () => void solicitarExclusao(eq),
    };
    const podeFinanceiro = hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS);
    const podeOrcamentoValores = podeFinanceiro
      || hasPermission(SENSITIVE_PERMISSIONS.PREPARE_QUOTES);
    const podeAlterarOrcamento = podeFinanceiro
      || (hasPermission(SENSITIVE_PERMISSIONS.PREPARE_QUOTES) && orcamentoEmElaboracao(eq.status));
    const podeExcluir = hasPermission(SENSITIVE_PERMISSIONS.DELETE_RECORDS);

    const acoes = acoesPorStatus(eq.status, {
      podeOrcamentoValores,
      podeFinanceiro,
      temTelefone: Boolean(eq.cliente_telefone),
      temProximosStatus: getProximosStatus(eq.status).length > 0,
    });
    const criarAcao = ({ id, rotulo }: AcaoStatus): PriorityAction => {
      switch (id) {
        case "status":
          return acaoStatus;
        case "iniciar_verificacao":
          return { id, label: rotulo, icon: <Play className="h-3.5 w-3.5" />, variant: "default", className: classeAcaoPrincipal, onClick: () => void acaoRapida(eq, "EM_VERIFICACAO"), disabled: salvando };
        case "abrir_verificacao":
          return { id, label: rotulo, icon: <ClipboardCheck className="h-3.5 w-3.5" />, variant: "default", className: classeAcaoPrincipal, onClick: () => abrirVerificacao(eq) };
        case "enviar_orcamento":
          return { id, label: rotulo, icon: <Send className="h-3.5 w-3.5" />, variant: "default", className: classeAcaoPrincipal, onClick: () => void abrirMudarStatus(eq, "AGUARDANDO_APROVACAO") };
        case "aprovar":
          return { id, label: rotulo, icon: <CheckCircle className="h-3.5 w-3.5" />, variant: "default", onClick: () => void abrirDialogoAprovacao(eq, "aprovar"), disabled: salvando };
        case "reprovar":
          return { id, label: rotulo, icon: <XCircle className="h-3.5 w-3.5" />, variant: "default", className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", onClick: () => void abrirDialogoAprovacao(eq, "reprovar"), disabled: salvando };
        case "iniciar_manutencao":
          return { id, label: rotulo, icon: <Wrench className="h-3.5 w-3.5" />, variant: "default", className: classeAcaoPrincipal, onClick: () => void acaoRapida(eq, "EM_MANUTENCAO"), disabled: salvando };
        case "marcar_pronto":
          return { id, label: rotulo, icon: <PackageCheck className="h-3.5 w-3.5" />, variant: "default", className: classeAcaoPrincipal, onClick: () => void handleMarcarPronto(eq), disabled: salvando || loadingAutomacao };
        case "retomar_manutencao":
          return { id, label: rotulo, icon: <Wrench className="h-3.5 w-3.5" />, variant: "default", className: classeAcaoPrincipal, onClick: () => void acaoRapida(eq, "EM_MANUTENCAO"), disabled: salvando };
        case "registrar_entrega":
          return { id, label: rotulo, icon: <PackageCheck className="h-3.5 w-3.5" />, variant: "default", className: classeAcaoPrincipal, onClick: () => void abrirMudarStatus(eq, "ENTREGUE") };
        case "reabrir_orcamento":
          return { id, label: rotulo, icon: <RotateCcw className="h-3.5 w-3.5" />, variant: "default", className: classeAcaoPrincipal, onClick: () => setReabrirAlvo(eq), disabled: salvando };
        case "renovar_orcamento":
          return { id, label: rotulo, icon: <RefreshCw className="h-3.5 w-3.5" />, variant: "default", className: classeAcaoPrincipal, onClick: () => void abrirMudarStatus(eq, "AGUARDANDO_APROVACAO") };
        case "mudar_status":
          return { id, label: rotulo, icon: <ArrowDownUp className="h-3.5 w-3.5" />, variant: "outline", onClick: () => void abrirMudarStatus(eq), ...(eq.status === "REPROVADO" ? { disabled: salvando } : {}) };
        case "os_pdf":
          return { id, label: rotulo, icon: <FileDown className="h-3.5 w-3.5" />, onClick: () => void gerarOrdemServicoPdf(eq), disabled: salvando };
        case "whatsapp_orcamento":
          return { id, label: rotulo, icon: <MessageSquare className="h-3.5 w-3.5" />, onClick: () => void enviarWhatsAppOrcamento(eq) };
        case "whatsapp_pronto":
          return { id, label: rotulo, icon: <MessageSquare className="h-3.5 w-3.5" />, onClick: () => void enviarWhatsAppPronto(eq) };
        case "desfazer_aprovacao":
          return { ...acaoCorrigirDecisao, id, label: rotulo };
      }
    };
    // AcaoDaLinha: um botão visível por linha. A secundária vai para o ⋯ — "Status"
    // abre a seção Equipamento; as outras (Reprovar) entram em "Neste status".
    const nesteStatus = (acao: AcaoStatus): PriorityAction =>
      acao.id === "status" ? criarAcao(acao) : { ...criarAcao(acao), className: undefined, group: "Neste status" };
    const primary: PriorityAction = criarAcao(acoes.principal);
    const secundaria = acoes.secundaria;
    const overflow: PriorityAction[] = [
      ...(secundaria && secundaria.id !== "status" ? [nesteStatus(secundaria)] : []),
      ...acoes.nesteStatus.map(nesteStatus),
      ...(secundaria?.id === "status" ? [acaoStatus] : []),
      acaoEditar,
      ...(podeExcluir ? [acaoExcluir] : []),
    ];

    if (STATUS_COM_ORCAMENTO.includes(eq.status)) {
      const editarIndex = overflow.findIndex((acao) => acao.id === acaoEditar.id);
      overflow.splice(
        editarIndex >= 0 ? editarIndex : overflow.length,
        0,
        acaoOrcamentoPdf,
        ...(podeAlterarOrcamento ? [acaoAlterarOrcamento] : []),
      );
    }
    if (["APROVADO", "EM_MANUTENCAO", "AGUARDANDO_PECA", "PRONTO"].includes(eq.status)) {
      overflow.unshift(acaoPecasOs);
    }
    if (getStatusCorrecao(eq.status).length > 0) {
      const editarIndex = overflow.findIndex((acao) => acao.id === acaoEditar.id);
      overflow.splice(editarIndex >= 0 ? editarIndex : overflow.length, 0, acaoCorrigirStatus);
    }

    return (
      <ActionPriorityRow
        primary={primary}
        // Na própria página de Detalhes, "Status" (abrir os detalhes) não faz sentido.
        overflow={agruparAcoesOs(naPagina ? overflow.filter((acao) => acao.id !== "status") : overflow)}
        acaoDaLinha
        destaque={naPagina}
        semPrincipal={naPagina && primary.id === "status"}
        menuTitulo={`${eq.marca} ${eq.modelo} · ${eq.serial_number}`}
      />
    );
  }

  // ─── Sub-renders para abas do drawer de detalhes ──────

  function renderVerificacaoTab() {
    if (carregandoDetalhes) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>;
    if (!verificacaoDetalhes) return <div className="text-center py-8 text-muted-foreground"><ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-20" /><p>Nenhuma verificação realizada</p></div>;

    const v = verificacaoDetalhes;
    const emailTecnico = emailDoTecnico(v.tecnico_nome) || "—";
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
                  {item.verificado ? <CheckCircle className="h-4 w-4 text-status-ok" /> : <XCircle className="h-4 w-4 text-destructive" />}
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
              <div key={s.id} className="flex justify-between text-sm border-b pb-1"><span>{s.descricao}</span><span className="font-medium">{formatCurrency(s.valor)}</span></div>
            ))}</div>
          </div>
        )}
        {pcs.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Peças</p>
            <div className="space-y-1">{pcs.map(p => (
              <div key={p.id} className="flex justify-between text-sm border-b pb-1"><span>{p.nome} (x{p.quantidade})</span><span className="font-medium">{formatCurrencyOrMissing(p.valorTotal)}</span></div>
            ))}</div>
          </div>
        )}
        <Card><CardContent className="pt-4">
          <div className="flex justify-between text-sm"><span>Mão de obra:</span><span>{formatCurrency(v.custo_estimado_mao_obra || 0)}</span></div>
          <div className="flex justify-between text-sm"><span>Peças:</span><span>{formatCurrency(v.custo_estimado_pecas || 0)}</span></div>
          <hr className="my-2" />
          <div className="flex justify-between font-bold"><span>Total:</span><span>{formatCurrency(v.custo_total || 0)}</span></div>
        </CardContent></Card>
        {v.observacoes && <div className="text-sm"><p className="text-muted-foreground">Obs:</p><p>{v.observacoes}</p></div>}
      </div>
    );
  }

  function renderHistoricoTab() {
    if (!selecionado) return null;
    const eq = selecionado;
    const eventos = historicoDetalhes;

    if (historicoDetalhesError) {
      return <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{historicoDetalhesError}</div>;
    }

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
        <HistoricoOs eventos={eventos} />
        <div className="flex items-center gap-2 rounded-lg bg-muted p-2.5 text-sm">
          <span className="text-muted-foreground">Status atual:</span>
          <StatusBadge status={eq.status} completo />
        </div>
      </div>
    );
  }

  // ─── Ajuste de orçamento: peças usadas pela página (/equipamentos/:id/orcamento) e pela janela de status ───
  function blocoAjusteHistorico() {
    return (
      <>
      {verificacaoAjusteOrcamento?.servicos_orcamento_original && (
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Orçamento original e decisões do cliente</summary>
          <p className="mt-2 text-muted-foreground">Itens da primeira decisão. Serviços reprovados precisam de nova aprovação para consumir peças.</p>
          {normalizarServicosOrcamento(verificacaoAjusteOrcamento.servicos_orcamento_original).map((servico) => (
            <p key={servico.id} className="mt-1">{servico.descricao} · {verificacaoAjusteOrcamento.decisoes_servicos?.find((d) => d.servico_id === servico.id)?.decisao ?? "Sem decisão"}</p>
          ))}
        </details>
      )}
      {verificacaoAjusteOrcamento?.adjusted_at && (
        <div className="rounded-md border bg-status-work-bg px-3 py-2 text-sm text-status-work flex items-center gap-2">
          <History className="h-4 w-4 text-status-work" />
          <div>
            <p className="text-xs text-status-work font-medium">Histórico de Ajustes</p>
            <p className="text-xs">
              Último ajuste em {new Date(verificacaoAjusteOrcamento.adjusted_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
      )}
      </>
    );
  }

  function blocoAjusteCampos(selecionado: Equipamento) {
    return (
      <>
      <div className="space-y-2"><Label htmlFor="valor-orcamento-input">Valor Orçamento (R$)</Label><ValorDecimalInput id="valor-orcamento-input" data-testid="valor-orcamento-input" required value={Number(valorOrcamento) || 0} onValueChange={setValorOrcamento} onValidityChange={setValorOrcamentoValido} />
        {Number(valorOrcamento) === 0 && !totalOrcamentoAjusteValido(0, osSomenteGarantia(servicosAjuste), selecionado.status, selecionado.valor_orcamento) && (
          <p className="text-xs text-destructive">{mensagemAjusteTotalZero(selecionado.status, selecionado.valor_orcamento)}</p>
        )}
      </div>
      {(!ajusteOrcamentoSemMudancaStatus || selecionado.status === "AGUARDANDO_APROVACAO") && (
        <div className="space-y-2"><Label>Prazo Aprovação</Label><DateIsoInput min={new Date().toLocaleDateString("en-CA")} value={prazoAprovacao} onValueChange={setPrazoAprovacao} /></div>
      )}
      <div className="space-y-2">
        <Label htmlFor="observacoes-ajuste">Observações</Label>
        <Textarea
          id="observacoes-ajuste"
          value={observacoesAjuste}
          onChange={(event) => setObservacoesAjuste(event.target.value)}
          placeholder="Observações do orçamento"
          rows={3}
        />
      </div>
      {ajusteOrcamentoSemMudancaStatus && orcamentoJaAprovado(selecionado.status) ? (
        <div className="space-y-3">
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Ao salvar, você escolhe entre ajustar sem nova aprovação (o cliente já concordou; só a quantidade adicional terá baixa) ou pedir nova aprovação pelo portal.
        </p>
        <FormaPagamentoFields
          codigo={formaPagamentoAjuste}
          detalhe={detalhePagamentoAjuste}
          onCodigoChange={setFormaPagamentoAjuste}
          onDetalheChange={setDetalhePagamentoAjuste}
          required
        />
        </div>
      ) : (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          A forma de pagamento será definida durante a aprovação.
        </div>
      )}
      {valorOrcamentoAnterior != null && valorOrcamento !== valorOrcamentoAnterior && (
        <p className="text-xs text-status-wait">
          Novo valor em negociação: {formatCurrency(valorOrcamento)} (antes: {formatCurrency(valorOrcamentoAnterior)}).
        </p>
      )}
      </>
    );
  }

  function blocoAjusteServicos(moldura = "space-y-3 rounded-md border p-3") {
    return (
      <>
      {verificacaoAjusteOrcamento && (
        <div className={moldura}>
          <AjusteOrcamentoServicos
            servicos={servicosAjuste}
            catalogo={catalogoServicosAjuste}
            carregandoCatalogo={carregandoCatalogoAjuste}
            onChange={setServicosAjuste}
            onRemoverTodos={() => {
              setConfirmProps({
                title: "Remover todos os serviços",
                description: "Você está removendo TODOS os serviços do orçamento. Deseja continuar?",
                variant: "destructive",
                onConfirm: () => {
                  setServicosAjuste([]);
                  setConfirmOpen(false);
                },
                onCancel: () => setConfirmOpen(false),
              });
              setConfirmOpen(true);
            }}
          />
          {pecasLegadasAjuste.length > 0 && (
            <div className="rounded-md border border-status-wait/30 bg-status-wait-bg p-2">
              <p className="text-xs font-semibold text-status-wait">Peças antigas sem serviço vinculado</p>
              <p className="text-xs text-status-wait">Vincule cada peça a um serviço para permitir aprovação parcial e baixa automática. Remova a linha antiga depois de vinculá-la.</p>
              {pecasLegadasAjuste.map((peca, indice) => (
                <div key={`${peca.id}-${indice}`} className="flex items-center justify-between gap-2 text-sm">
                  <span>{peca.nome} × {peca.quantidade} · {formatCurrencyOrMissing(peca.valorTotal)}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setPecasLegadasAjuste((atual) => atual.filter((_, i) => i !== indice))}>Remover linha antiga</Button>
                </div>
              ))}
            </div>
          )}
          {pecasLegadasAjuste.length === 0 && servicosAjuste.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum serviço ou peça registrado na verificação.</p>
          )}
        </div>
      )}
      </>
    );
  }

  /** Mesma regra do botão Confirmar da janela de status, para o ajuste. */
  function confirmarStatusBloqueado(selecionado: Equipamento) {
    return salvando || (!novoStatus && !ajusteOrcamentoSemMudancaStatus) || (((novoStatus === "AGUARDANDO_APROVACAO" && !reabreOrcamentoSemAjuste(selecionado.status, novoStatus)) || ajusteOrcamentoSemMudancaStatus) && !valorOrcamentoValido) || (novoStatus === "AGUARDANDO_APROVACAO" && !reabreOrcamentoSemAjuste(selecionado.status, novoStatus) && !totalOrcamentoAprovacaoValido(Number(valorOrcamento))) || (ajusteOrcamentoSemMudancaStatus && !totalOrcamentoAjusteValido(Number(valorOrcamento), osSomenteGarantia(servicosAjuste), selecionado.status, selecionado.valor_orcamento));
  }

  /** Soma dos serviços e peças do ajuste, ao vivo (a mesma conta do aviso de divergência ao confirmar). */
  function somaDoAjuste() {
    const servicos = servicosAjuste.reduce((soma, servico) => soma + (Number(servico.valor) || 0), 0);
    const pecas = [...pecasParaOrcamento(servicosAjuste), ...pecasLegadasAjuste].reduce((soma, peca) => soma + peca.valorTotal, 0);
    return servicos + pecas;
  }

  /** Ajuste de orçamento como página (decisão 24): mesmos campos e regras da janela; o status da OS não muda. */
  function renderPaginaAjuste(selecionado: Equipamento) {
    const soma = somaDoAjuste();
    return (
      <section aria-labelledby="ajuste-orcamento-titulo" className="-mb-4 flex min-h-[calc(100vh-8rem)] flex-col gap-4 lg:-mb-8">
        <div>
          <button
            type="button"
            onClick={() => fecharPaginaAjuste()}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors duration-rapida hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            <span className="[overflow-wrap:anywhere]">{selecionado.marca} {selecionado.modelo} · {selecionado.serial_number}</span>
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 id="ajuste-orcamento-titulo" className="text-[26px] font-bold leading-tight tracking-tight">Ajuste de orçamento</h1>
            <StatusBadge status={selecionado.status} completo />
          </div>
        </div>

        {blocoAjusteHistorico()}

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="mb-3 text-base font-bold">Valores</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-muted px-4 py-3">
              <p className="text-xs text-muted-foreground">Valor original (verificação)</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{valorOrcamentoOriginal != null ? formatCurrency(valorOrcamentoOriginal) : "—"}</p>
            </div>
            <div className="rounded-xl bg-muted px-4 py-3">
              <p className="text-xs text-muted-foreground">Valor atual antes do ajuste</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{valorOrcamentoAnterior != null ? formatCurrency(valorOrcamentoAnterior) : "—"}</p>
            </div>
            <div className="rounded-xl bg-status-ok-bg px-4 py-3 text-status-ok">
              <p className="text-xs">Novo valor calculado</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums">{formatCurrency(soma)}</p>
            </div>
          </div>
        </section>

        {verificacaoAjusteOrcamento && (
          <section className="rounded-2xl border bg-card p-5">
            <h2 className="mb-3 text-base font-bold">Serviços e peças</h2>
            {blocoAjusteServicos("space-y-3")}
          </section>
        )}

        <section className="space-y-4 rounded-2xl border bg-card p-5">
          <h2 className="text-base font-bold">Orçamento</h2>
          {blocoAjusteCampos(selecionado)}
        </section>

        <div className="sticky bottom-0 z-20 -mx-4 mt-auto flex flex-wrap items-center justify-between gap-3 border-t bg-card px-4 py-3 lg:-mx-8 lg:px-8">
          <p className="text-sm text-muted-foreground">O status atual do equipamento será mantido.</p>
          <div className="flex w-full gap-2 md:w-auto">
            <Button type="button" variant="outline" className="h-12 flex-1 md:h-10 md:flex-none" onClick={() => fecharPaginaAjuste()}>Cancelar</Button>
            <Button type="button" className="h-12 flex-1 md:h-10 md:flex-none" onClick={iniciarConfirmacaoStatus} disabled={confirmarStatusBloqueado(selecionado)}>
              {salvando ? "Salvando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // ─── Render principal ─────────────────────────────────

  const sequenciaFotoFormulario = fotoEdicaoSeq.current;

  return (
    <div className="space-y-6">
      {!detalhesDialogOpen && idAjusteRota == null && !paginaAjusteAberta && idVerificacaoRota == null && !verificacaoDialogOpen && (<>
      {/* Header */}
      <PageHeader
        titulo="Equipamentos"
        descricao={loading
          ? "Carregando…"
          : `${totalEquipamentos} ${totalEquipamentos === 1 ? "equipamento" : "equipamentos"}${busca || statusFiltro !== "TODOS" ? " neste filtro" : ""}`}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void baixarCsv()} disabled={exportando}>{exportando ? "Exportando…" : "Exportar"}</Button>
          <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Nova entrada</Button>
        </div>
      </PageHeader>

      {erroListaEquipamentos && (
        <ErrorAlert
          variant="error"
          context="Equipamentos"
          message={avisoAtualizacao
            ? `Equipamento salvo, mas a lista não foi atualizada: ${avisoAtualizacao}`
            : erroListaEquipamentos}
        />
      )}

      {/* Lista: filtros, tabela e paginação num painel só */}
      <Card className="rounded-2xl">
        <CardContent className="space-y-4 p-5">
          <FiltroDeStatus
            rotulo="Filtrar equipamentos por status"
            principais={FILTRO_STATUS_PRINCIPAIS}
            outros={FILTRO_STATUS_OUTROS}
            valor={statusFiltro}
            contagens={contagensStatus}
            onChange={setStatusFiltro}
            multiplo
          />
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Pesquisar equipamentos" placeholder="Série, patrimônio, equipamento, cliente, contato ou CPF/CNPJ" value={busca} onChange={e => setBusca(e.target.value)} className="h-10 bg-muted pl-9 pr-10" />
              {busca && <Button type="button" variant="ghost" size="icon" aria-label="Limpar pesquisa" className="absolute right-0 top-0 h-full w-10" onClick={() => setBusca("")}><X className="h-4 w-4" /></Button>}
            </div>
            <div className="flex gap-3">
            <Select value={tecnicoFiltro} onValueChange={setTecnicoFiltro}>
              <SelectTrigger aria-label="Filtrar por técnico" className="h-10 min-w-0 flex-1 lg:w-44 lg:flex-none">
                <span className="truncate">Técnico: {tecnicoFiltro === "TODOS" ? "todos" : tecnicoFiltro}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os técnicos</SelectItem>
                {nomesFiltroTecnico.map((nome) => (
                  <SelectItem key={nome} value={nome}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ordenacao} onValueChange={(value: "ATUALIZACAO_RECENTE" | "CADASTRO_RECENTE") => setOrdenacao(value)}>
              <SelectTrigger aria-label="Ordenar equipamentos" className="h-10 min-w-0 flex-1 lg:w-56 lg:flex-none">
                <ArrowDownUp className="h-4 w-4 mr-2" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ATUALIZACAO_RECENTE">Alterados recentemente</SelectItem>
                <SelectItem value="CADASTRO_RECENTE">Cadastros recentes</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" aria-label="Atualizar equipamentos" className="h-10 w-10 shrink-0" onClick={recarregar}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : equipamentos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Printer className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium mb-1">Nenhum equipamento encontrado</p>
              <p className="text-sm">{busca || statusFiltro !== "TODOS" ? "Tente ajustar os filtros" : "Clique em 'Nova entrada' para cadastrar"}</p>
            </div>
          ) : (
            <>
              {/* Celular: um cartão por equipamento; a tabela larga com a coluna fixa só a partir de md. */}
              {!telaLarga ? (
              <ul className="space-y-3" aria-label="Equipamentos">
                {equipamentosExibidos.map(eq => (
                  <li key={eq.id} className="space-y-3 rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        aria-label={`Abrir detalhes de ${eq.marca} ${eq.modelo}`}
                        onClick={() => void abrirDetalhes(eq)}
                      >
                        <span className="block truncate font-semibold">{eq.marca} {eq.modelo}</span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">{eq.serial_number}</span>
                      </button>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {eq.valor_orcamento != null && eq.valor_orcamento > 0 ? formatCurrency(eq.valor_orcamento) : <span className="font-normal text-muted-foreground">—</span>}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <p className="truncate text-sm">
                        {eq.cliente_nome || "—"}
                        <span className="text-muted-foreground"> · entrada {formatDatePtBr(eq.data_entrada)}</span>
                      </p>
                      <p className="text-sm font-medium">{STATUS_LABELS[eq.status as StatusEquipamento] || eq.status}</p>
                      <BarraDeEtapas status={eq.status} />
                    </div>
                    <div className="flex justify-end">{renderAcoes(eq)}</div>
                  </li>
                ))}
              </ul>
              ) : (
              <div className="overflow-hidden rounded-xl border">
                <Table className="min-w-[67.5rem] table-fixed border-separate border-spacing-0">
                <TableHeader className="bg-muted [&_tr]:!border-b-0 [&_th]:h-10 [&_th]:border-b [&_th]:text-xs [&_th]:font-semibold">
                  <TableRow>
                    <TableHead className="w-[12rem]">Equipamento</TableHead>
                    <TableHead className="w-[11rem]">Cliente</TableHead>
                    <TableHead className="w-[11rem]">Andamento</TableHead>
                    <TableHead className="w-[5.5rem]">Técnico</TableHead>
                    <TableHead className="w-[5rem]">Entrada</TableHead>
                    <TableHead className="w-[7.5rem] text-right">Orçamento</TableHead>
                    <TableHead className="sticky right-0 z-20 w-[15.5rem] min-w-[15.5rem] bg-muted text-right">Próxima ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:!border-b-0 [&_tr:last-child_td]:border-b-0 [&_td]:py-2.5">
                  {equipamentosExibidos.map(eq => (
                    <TableRow
                      key={eq.id}
                      className="group cursor-pointer"
                      onClick={() => void abrirDetalhes(eq)}
                    >
                      <TableCell className={`overflow-hidden ${EQUIPMENT_ROW_FOCUS_FIRST}`}>
                        <div className="min-w-0">
                          <button
                            type="button"
                            className="equipment-row-open block w-full min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-semibold text-inherit focus-visible:outline-none"
                            aria-label={`Abrir detalhes de ${eq.marca} ${eq.modelo}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void abrirDetalhes(eq);
                            }}
                          >
                            <span className="block truncate" title={`${eq.marca} ${eq.modelo} · ${eq.tipo}`}>{eq.marca} {eq.modelo}</span>
                          </button>
                          <p className="truncate font-mono text-xs text-muted-foreground" title={eq.serial_number}>{eq.serial_number}</p>
                        </div>
                      </TableCell>
                      <TableCell className={`overflow-hidden ${EQUIPMENT_ROW_FOCUS_EDGE}`}>
                        {eq.cliente_nome ? (
                          <div className="min-w-0">
                            <span className="block truncate text-sm" title={eq.cliente_nome}>{eq.cliente_nome}</span>
                            {(eq.responsavel_nome || eq.cliente_telefone) && (
                              <p className="truncate text-xs text-muted-foreground" title={eq.responsavel_nome || eq.cliente_telefone || undefined}>{eq.responsavel_nome || eq.cliente_telefone}</p>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className={`overflow-hidden ${EQUIPMENT_ROW_FOCUS_EDGE}`}>
                        <div className="min-w-0 space-y-1.5">
                          <span className="block truncate text-sm font-medium">
                            {STATUS_LABELS[eq.status as StatusEquipamento] || eq.status}
                          </span>
                          <BarraDeEtapas status={eq.status} />
                          {eq.status === "AGUARDANDO_APROVACAO" &&
                            (eq.resposta_cliente === "APROVAR" || eq.resposta_cliente === "RECUSAR") && (
                              <div className="inline-flex max-w-full items-center truncate rounded-full border border-status-work/30 bg-status-work-bg px-2 py-0.5 text-xs font-medium text-status-work">
                                Cliente respondeu: {eq.resposta_cliente === "APROVAR" ? "aprovou" : "recusou"} — {
                                  eq.resposta_cliente_situacao === "EM_CORRECAO" ? "em prazo de correção"
                                    : eq.resposta_cliente_situacao === "PROCESSANDO" ? "aguardando efetivação automática"
                                      : eq.resposta_cliente_situacao === "PENDENTE_EQUIPE" ? "efetivação falhou, confira"
                                        : "aguardando conferência"}
                              </div>
                            )}
                        </div>
                      </TableCell>
                      <TableCell className={`overflow-hidden text-sm text-muted-foreground ${EQUIPMENT_ROW_FOCUS_EDGE}`}>
                        <span className="block truncate" title={eq.tecnico_nome ?? undefined}>{eq.tecnico_nome || "—"}</span>
                      </TableCell>
                      <TableCell className={`overflow-hidden text-sm text-muted-foreground tabular-nums ${EQUIPMENT_ROW_FOCUS_EDGE}`}>
                        <span className="block truncate" title={`Entrada em ${formatDatePtBr(eq.data_entrada)} · última alteração: ${formatDatePtBr(eq.atualizado_em || eq.criado_em)}`}>{formatDatePtBr(eq.data_entrada).slice(0, 5)}</span>
                      </TableCell>
                      <TableCell className={`overflow-hidden text-right text-sm font-semibold tabular-nums ${EQUIPMENT_ROW_FOCUS_EDGE}`}>
                        {eq.valor_orcamento != null && eq.valor_orcamento > 0 ? formatCurrency(eq.valor_orcamento) : <span className="font-normal text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell
                        className={`sticky right-0 z-10 w-[15.5rem] min-w-[15.5rem] bg-card text-right group-hover:bg-muted/50 ${EQUIPMENT_ROW_FOCUS_LAST}`}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
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
              <PaginationControls
                page={paginaEquipamentosExibida}
                totalPages={totalPaginasEquipamentos}
                onPageChange={setPaginaEquipamentos}
                label="Paginação de equipamentos"
                totalItems={totalEquipamentos}
                className="pb-0"
              />
            </>
          )}
        </CardContent>
      </Card>
      </>)}

      {/* ═══ Dialog Criar/Editar ═══ */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open) {
          fotoEdicaoSeq.current += 1;
          fotoEdicaoEquipamentoId.current = null;
          baselineFotosRef.current = null;
          setRegistrosAnteriores([]);
          setConfirmouNovoCiclo(false);
          setAnteriorEmAtendimento(null);
        }
        setDialogOpen(open);
      }}>
        <DialogContent tamanho="g">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-6">
            {/* ── Cliente ── */}
            <div className="space-y-2">
              <ClienteSelector
                clienteInicial={clienteVinculado}
                onClienteSelecionado={(c) => { setClienteVinculado(c); setResponsavelVinculado(null); setErroCliente(null); setAnteriorEmAtendimento(null); }}
                onClienteRemovido={() => { setClienteVinculado(null); setResponsavelVinculado(null); setAnteriorEmAtendimento(null); }}
                onEquipamentoSelecionado={editando ? undefined : (anterior) => void usarEquipamentoAnterior(anterior)}
                readOnly={false}
              />
              {anteriorEmAtendimento && (
                <AnteriorEmAtendimentoAviso
                  equipamento={anteriorEmAtendimento}
                  onAbrirAtendimento={(eq) => navigate("/equipamentos", { state: { equipamentoId: eq.id } })}
                />
              )}
              <ContatoResponsavelSelector
                cliente={clienteVinculado}
                empresaId={clienteVinculado?.empresa_id || editando?.empresa_id}
                value={responsavelVinculado}
                onChange={setResponsavelVinculado}
                disabled={salvando}
                preSelecionar={!editando}
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
                  <div className="relative">
                    <Input
                      {...form.register("serial_number")}
                      onInput={(e) => handleSerialInput((e.target as HTMLInputElement).value)}
                      onBlur={(e) => {
                        void form.register("serial_number").onBlur(e);
                        void handleSerialBlur();
                      }}
                    />
                    {mostrarSugestoes && sugestoesSerial.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md">
                        {sugestoesSerial.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
                            onClick={() => selecionarSerialSugestao(r.serial_number)}
                          >
                            <span className="font-mono font-medium">{r.serial_number}</span>
                            <StatusBadge status={r.status} />
                            <span className="text-xs text-muted-foreground ml-auto">
                              #{r.id} — {r.marca} {r.modelo}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <FormValidationError message={form.formState.errors.serial_number?.message} />
                  {registrosAnteriores.length > 0 && (
                    <div className="mt-2 rounded-md border border-status-wait bg-status-wait-bg p-3 space-y-2">
                      <p className="text-sm font-bold text-status-wait">
                        ⚠️ ATENÇÃO: Este número de série já foi registrado anteriormente. Marque esta caixa apenas se realmente deseja criar um NOVO ciclo de manutenção.
                      </p>
                      <ul className="space-y-1">
                        {registrosAnteriores.map((r) => (
                          <li key={r.id} className="text-xs text-status-wait flex items-center gap-1 flex-wrap">
                            <span>• #{r.id}</span>
                            <StatusBadge status={r.status} />
                            <span>— Entrada: {formatDatePtBr(r.data_entrada)}</span>
                            {r.data_saida && (
                              <span>| Saída: {new Date(r.data_saida).toLocaleDateString("pt-BR")}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="text-xs text-status-wait">
                        O histórico anterior será preservado. Este será um registro independente.
                      </p>
                      <label className="flex items-center gap-2 text-sm cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={confirmouNovoCiclo}
                          onChange={(e) => setConfirmouNovoCiclo(e.target.checked)}
                          className="rounded border-status-wait"
                        />
                        <span className="text-status-wait font-semibold">Confirmo que desejo criar um novo ciclo de manutenção para este equipamento</span>
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
                  <Select
                    value={MARCA_EQUIPAMENTO_OPTIONS.includes(form.watch("marca")) ? form.watch("marca") : form.watch("marca") ? "Outro" : ""}
                    onValueChange={(value) => {
                      if (value === "Outro") { setMarcaOutroOpen(true); return; }
                      form.setValue("marca", value, { shouldDirty: true, shouldValidate: true });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>{MARCA_EQUIPAMENTO_OPTIONS.map((marca) => <SelectItem key={marca} value={marca}>{marca}</SelectItem>)}</SelectContent>
                  </Select>
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
                    <Select value={TIPO_OPTIONS.includes(field.value) ? field.value : field.value ? "Outro" : ""} onValueChange={(value) => {
                      if (value === "Outro") { setTipoOutroOpen(true); return; }
                      field.onChange(value);
                    }}>
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
                    value={tecnicoNovoEquipamento || undefined}
                    onValueChange={(value: TecnicoDisponivel) => setTecnicoNovoEquipamento(value)}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {tecnicoNovoEquipamento && !tecnicos.some((t) => t.nome === tecnicoNovoEquipamento) && (
                        <SelectItem value={tecnicoNovoEquipamento}>{tecnicoNovoEquipamento}</SelectItem>
                      )}
                      {tecnicos.map((tecnico) => (
                        <SelectItem key={tecnico.id} value={tecnico.nome}>{tecnico.nome}</SelectItem>
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
                {erroImagens && (
                  <div className="space-y-2">
                    <ErrorAlert variant="error" context="Equipamentos" message={erroImagens} />
                    {editando && !carregandoImagensFormulario && (
                      <div className="space-y-1">
                        <Button type="button" variant="outline" size="sm" onClick={recarregarFotosDaEdicao}>
                          Recarregar fotos
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Recarregar substitui a seleção local de fotos pelas fotos atualmente salvas. Os campos de texto serão preservados.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3 rounded-lg border p-3">
                         <div className="flex items-center gap-2">
                          <div>
                            <Label htmlFor="equipamento-imagens-entrada">Fotos da entrada</Label>
                            <p className="text-xs text-muted-foreground">Use para registrar avarias e estado no recebimento.</p>
                          </div>
                          <div className="flex flex-col gap-1">
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
                              variant="outline"
                              size="sm"
                              className="gap-1.5 border-status-work/30 bg-status-work-bg text-status-work hover:bg-status-work-bg hover:text-status-work"
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
                              Via Celular
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
                      <div role="status" aria-label="Carregando fotos" className="flex items-center justify-center rounded-lg border border-dashed p-6">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
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
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline" type="button">Cancelar</Button></DialogClose>
              <Button type="submit" disabled={salvando || (registrosAnteriores.length > 0 && !confirmouNovoCiclo)}>
                {salvando ? "Salvando..." : registrosAnteriores.length > 0 ? "Criar novo ciclo" : editando ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ═══ Detalhes da OS (rota /equipamentos/:id) ═══ */}
      {idVerificacaoRota != null && !verificacaoDialogOpen && (
        <div role="status" aria-label="Carregando verificação" className="flex h-64 items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
      {/* ═══ Verificação técnica (rota /equipamentos/:id/verificacao, decisão 24) ═══ */}
      <VerificacaoTecnica
        key={selecionado?.id ?? "verificacao"}
        equipamento={selecionado}
        open={verificacaoDialogOpen}
        onOpenChange={(aberta) => { if (!aberta) fecharPaginaVerificacao(); }}
        onConcluir={handleConcluirVerificacao}
        salvando={salvando || loadingAutomacao}
        tecnicoInicial={extrairTecnicoInicialDeObservacoes(selecionado?.observacoes || "") || primeiroTecnico}
        podeFinalizar={hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS) || hasPermission(SENSITIVE_PERMISSIONS.PREPARE_QUOTES)}
      />

      {/* ═══ Ajuste de orçamento (rota /equipamentos/:id/orcamento, decisão 24) ═══ */}
      {idAjusteRota != null && !paginaAjusteAberta && (
        <div role="status" aria-label="Carregando ajuste de orçamento" className="flex h-64 items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
      {paginaAjusteAberta && selecionado && renderPaginaAjuste(selecionado)}

      {detalhesDialogOpen && !paginaAjusteAberta && !verificacaoDialogOpen && selecionado?.id !== idDetalhesAberto && (
        <div role="status" aria-label="Carregando atendimento" className="flex h-64 items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
      {detalhesDialogOpen && !paginaAjusteAberta && !verificacaoDialogOpen && selecionado && selecionado.id === idDetalhesAberto && (
        <PortalClienteProvider equipamento={selecionado} sinalPortal={sinalPortal} onConfigurarPortal={irParaConfiguracoesPortal}>
          <section aria-labelledby="detalhes-equipamento-titulo" className="space-y-5">
            <h2 id="detalhes-equipamento-titulo" className="sr-only">Detalhes do Equipamento</h2>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    setIdDetalhesAberto(null);
                    navigate("/equipamentos");
                  }}
                  className="mb-1 inline-flex items-center gap-0.5 text-[13px] font-medium text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />Equipamentos
                </button>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                  <h1 className="break-words text-[26px] font-bold leading-tight tracking-tight [overflow-wrap:anywhere]">{selecionado.marca} {selecionado.modelo}</h1>
                  <span className="font-mono text-sm text-muted-foreground [overflow-wrap:anywhere]">{selecionado.serial_number}</span>
                  <StatusBadge status={selecionado.status} completo />
                </div>
              </div>
              <div className="flex shrink-0 justify-end">{renderAcoes(selecionado, true)}</div>
            </div>

            <Card className="rounded-2xl">
              <CardContent className="p-5">
                <BarraDeEtapasGrande status={selecionado.status} historico={historicoDetalhes} />
              </CardContent>
            </Card>

            <DecisaoOrcamentoCard
              onAplicar={(decisao) => void abrirDialogoAprovacao(selecionado, decisao)}
            />

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <Card className="min-w-0 rounded-2xl">
                <Tabs key={selecionado.id} value={abaDetalhe} onValueChange={setAbaDetalhe}>
                  <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent px-3 pt-2 [scrollbar-width:none]">
                    {[
                      ["orcamento", "Orçamento"],
                      ["verificacao", "Verificação"],
                      ["fotos", `Fotos · ${imagensDetalhes.length}`],
                      ["historico", "Histórico"],
                      ["comunicacoes", "Comunicação"],
                    ].map(([valor, rotulo]) => (
                      <TabsTrigger
                        key={valor}
                        value={valor}
                        className="relative rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-sm font-semibold text-muted-foreground shadow-none data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
                      >
                        {rotulo}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  <TabsContent value="orcamento" className="mt-0 space-y-4 p-5">
                    {carregandoDetalhes ? (
                      <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
                    ) : (
                      <OrcamentoDaOs
                        equipamento={selecionado}
                        verificacao={verificacaoDetalhes}
                        enviadoEm={orcamentoEnviadoEm}
                        pendentes={pecasPendentes}
                        onAlterar={STATUS_COM_ORCAMENTO.includes(selecionado.status)
                          && (hasPermission(SENSITIVE_PERMISSIONS.FINANCIAL_ACTIONS)
                            || (hasPermission(SENSITIVE_PERMISSIONS.PREPARE_QUOTES) && orcamentoEmElaboracao(selecionado.status)))
                          ? () => void abrirAlterarOrcamento(selecionado)
                          : undefined}
                      />
                    )}
                    <DocumentosEquipamento equipamento={selecionado} />
                  </TabsContent>

                  <TabsContent value="verificacao" className="mt-0 p-5">{renderVerificacaoTab()}</TabsContent>

                  <TabsContent value="fotos" className="mt-0 p-5">
                    <div className="grid gap-4 lg:grid-cols-2">
                      {(["ENTRADA", "SAIDA"] as const).map((categoria) => (
                        <div key={categoria} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold">{categoria === "ENTRADA" ? "Fotos da entrada" : "Fotos da saída"}</p>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">
                                {filtrarImagensPorCategoria(imagensDetalhes, categoria).length} registrada(s)
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={categoria === "ENTRADA" ? "Enviar fotos da entrada pelo celular" : "Enviar fotos da saída pelo celular"}
                                onClick={() => {
                                  setPhotoUploadCategoria(categoria);
                                  setPhotoUploadNewEquip(false);
                                  setPhotoUploadOpen(true);
                                }}
                              >
                                <Smartphone className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          {carregandoDetalhes ? (
                            <div className="flex items-center justify-center rounded-lg border border-dashed p-6">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                            </div>
                          ) : (
                            <GaleriaImagensEquipamento
                              imagens={filtrarImagensPorCategoria(imagensDetalhes, categoria)}
                              mensagemVazia={categoria === "ENTRADA"
                                ? "Nenhuma foto de entrada foi registrada para este equipamento."
                                : "Nenhuma foto de saída foi registrada para este equipamento."}
                              onVisualizar={setImagemExpandida}
                              onExportar={(imagem) => void exportarImagemEquipamento(imagem)}
                              onRemover={(imagem) => void removerImagemDetalhes(imagem)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="historico" className="mt-0 p-5">{renderHistoricoTab()}</TabsContent>

                  <TabsContent value="comunicacoes" className="mt-0 p-5">
                    {carregandoDetalhes ? (
                      <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" /></div>
                    ) : (
                      <HistoricoComunicacoes
                        equipamentoId={selecionado.id!}
                        comunicacoesExternas={comunicacoes}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </Card>

              <div className="space-y-5">
                <CartaoCliente
                  dados={{
                    nome: selecionado.cliente_nome,
                    documento: selecionado.cliente_documento,
                    email: selecionado.cliente_email,
                    telefone: selecionado.cliente_telefone,
                    contato: selecionado.responsavel_nome
                      ? {
                          nome: selecionado.responsavel_nome,
                          papel: "Contato responsável",
                          email: selecionado.responsavel_email,
                          telefone: selecionado.responsavel_telefone,
                        }
                      : null,
                  }}
                  rodape={<div className="flex justify-end"><PortalClienteBotao /></div>}
                />

                <Card className="rounded-2xl">
                  <CardContent className="space-y-3 p-5">
                    <h2 className="text-base font-bold">Equipamento</h2>
                    <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                      <dt className="text-muted-foreground">Tipo</dt><dd className="font-medium">{selecionado.tipo}</dd>
                      <dt className="text-muted-foreground">Nº Série</dt><dd className="font-mono [overflow-wrap:anywhere]">{selecionado.serial_number}</dd>
                      <dt className="text-muted-foreground">Patrimônio</dt><dd className="font-medium">{selecionado.patrimonio || "—"}</dd>
                      <dt className="text-muted-foreground">Entrada</dt><dd className="font-medium">{formatDatePtBr(selecionado.data_entrada)}</dd>
                      {verificacaoDetalhes?.tecnico_nome && (<><dt className="text-muted-foreground">Técnico</dt><dd className="font-medium">{verificacaoDetalhes.tecnico_nome}</dd></>)}
                      {selecionado.ciclo_serial != null && selecionado.ciclo_serial > 0 && (
                        <><dt className="text-muted-foreground">Ciclos</dt><dd className="font-medium">{selecionado.ciclo_serial}º atendimento deste serial</dd></>
                      )}
                    </dl>
                    {selecionado.acessorios && (
                      <div className="flex flex-wrap gap-1.5">
                        {selecionado.acessorios.split(",").map((item) => item.trim()).filter(Boolean).map((item) => (
                          <span key={item} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">{item}</span>
                        ))}
                      </div>
                    )}
                    {selecionado.acessorios_outros && (
                      <div className="rounded-xl bg-muted p-3 text-sm"><p className="text-xs text-muted-foreground">Outros acessórios</p><p className="whitespace-pre-wrap">{selecionado.acessorios_outros}</p></div>
                    )}
                    {selecionado.defeito_relatado && (
                      <div className="rounded-xl bg-muted p-3 text-sm"><p className="text-xs text-muted-foreground">Defeito relatado</p><p className="whitespace-pre-wrap">{selecionado.defeito_relatado}</p></div>
                    )}
                    {selecionado.observacoes && (
                      <div className="rounded-xl bg-muted p-3 text-sm"><p className="text-xs text-muted-foreground">Observação física</p><p className="whitespace-pre-wrap">{selecionado.observacoes}</p></div>
                    )}
                  </CardContent>
                </Card>

                <ResumoComunicacoes comunicacoes={comunicacoes} onVerTodas={() => setAbaDetalhe("comunicacoes")} />
              </div>
            </div>
          </section>
        </PortalClienteProvider>
      )}

      <EscolhaAjusteOrcamentoDialog
        open={escolhaAjuste !== null}
        variante={escolhaAjuste?.variante ?? "aprovado"}
        analise={escolhaAjuste?.analise ?? null}
        onConfirmar={responderEscolhaAjuste}
        onCancelar={() => responderEscolhaAjuste(null)}
      />

      <CorrigirDecisaoDialog
        equipamento={corrigirDecisaoAlvo}
        open={corrigirDecisaoAlvo !== null}
        onOpenChange={(open) => { if (!open) setCorrigirDecisaoAlvo(null); }}
        onCorrigido={async (portal) => {
          setSelecionado(null);
          await recarregar();
          // A republicação no portal é feita depois da correção; se falhar, a correção vale e o operador é avisado.
          if (portal?.aviso) {
            warning("Equipamentos", `Orçamento reaberto, mas o portal não foi atualizado: ${portal.aviso}`);
          } else {
            const portalTexto = portal?.mensagem ? ` ${portal.mensagem}` : " Envie ou registre uma nova decisão do cliente.";
            success("Equipamentos", `Orçamento reaberto.${portalTexto}`, "Decisão corrigida");
          }
        }}
      />

      <ReabrirOrcamentoDialog
        open={reabrirAlvo !== null}
        onOpenChange={(open) => { if (!open) setReabrirAlvo(null); }}
        onCorrigirEngano={() => { if (reabrirAlvo) void abrirCorrigirDecisao(reabrirAlvo); }}
        onNovaProposta={() => { if (reabrirAlvo) void abrirMudarStatus(reabrirAlvo, "AGUARDANDO_APROVACAO"); }}
      />

      {/* ═══ Dialog Mudar Status ═══ */}
      <Dialog
        open={statusDialogOpen && !ajusteOrcamentoSemMudancaStatus}
        onOpenChange={(open) => {
          setStatusDialogOpen(open);
          if (!open) {
            setAjusteOrcamentoSemMudancaStatus(false);
            setCorrecaoStatus(false);
            setMotivoCorrecaoStatus("");
          }
        }}
      >
        <DialogContent tamanho="m" className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {(
                (novoStatus === "AGUARDANDO_APROVACAO" && selecionado && !reabreOrcamentoSemAjuste(selecionado.status, novoStatus))
                || ajusteOrcamentoSemMudancaStatus
              ) ? "Ajuste de Orçamento" : correcaoStatus ? "Corrigir Status" : "Alterar Status"}
            </DialogTitle>
          </DialogHeader>
          {selecionado && (
            <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {!ajusteOrcamentoSemMudancaStatus && (
                <>
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
                          {(correcaoStatus ? getStatusCorrecao(selecionado.status) : getProximosStatus(selecionado.status, { semPreSelecao: statusSemPreSelecao })).map(s => (
                            <SelectItem key={s} value={s}>{STATUS_LABELS[s as StatusEquipamento] || s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {correcaoStatus && novoStatus === "AGUARDANDO_APROVACAO" && ["APROVADO", "REPROVADO"].includes(selecionado.status) && (
                    <div role="alert" className="space-y-2 rounded-md border border-status-wait/30 bg-status-wait-bg p-3 text-sm text-status-wait">
                      <p>
                        Trocar só o status não desfaz pagamento, serviços aprovados nem baixa de estoque. Use a correção guiada da decisão.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const alvo = selecionado;
                          setStatusDialogOpen(false);
                          void abrirCorrigirDecisao(alvo);
                        }}
                      >
                        Corrigir decisão do orçamento
                      </Button>
                    </div>
                  )}
                  {correcaoStatus && (
                    <div className="space-y-2">
                      <Label htmlFor="motivo-correcao-status">Motivo da correção *</Label>
                      <Textarea
                        id="motivo-correcao-status"
                        value={motivoCorrecaoStatus}
                        onChange={(event) => setMotivoCorrecaoStatus(event.target.value)}
                        placeholder="Ex.: status alterado por clique indevido"
                      />
                      <p className="text-xs text-muted-foreground">A correção e o motivo serão registrados para auditoria.</p>
                    </div>
                  )}
                </>
              )}
              {((novoStatus === "AGUARDANDO_APROVACAO" && !reabreOrcamentoSemAjuste(selecionado.status, novoStatus)) || ajusteOrcamentoSemMudancaStatus) && (
                <>
                  <div className="rounded-md border bg-status-wait-bg px-3 py-2 text-sm text-status-wait">
                    {ajusteOrcamentoSemMudancaStatus
                      ? "Edite o orçamento. O status atual do equipamento será mantido."
                      : "Revise o valor e o prazo para reenviar o orçamento atualizado ao cliente."}
                  </div>
                  {blocoAjusteHistorico()}
                  {(valorOrcamentoOriginal != null || valorOrcamentoAnterior != null) && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground">Valor original (verificação)</p>
                        <p className="font-semibold">
                          {valorOrcamentoOriginal != null ? formatCurrency(valorOrcamentoOriginal) : "—"}
                        </p>
                      </div>
                      <div className="rounded-md border bg-status-work-bg px-3 py-2 text-sm text-status-work">
                        <p className="text-xs text-status-work">Valor atual antes do ajuste</p>
                        <p className="font-semibold">
                          {valorOrcamentoAnterior != null ? formatCurrency(valorOrcamentoAnterior) : "—"}
                        </p>
                      </div>
                    </div>
                  )}
                  {blocoAjusteCampos(selecionado)}
                  {blocoAjusteServicos()}
                  {valorOrcamentoOriginal != null && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                        <p className="text-xs text-muted-foreground">Valor original (verificação)</p>
                        <p className="font-semibold">{formatCurrency(valorOrcamentoOriginal)}</p>
                      </div>
                      <div className="rounded-md border bg-status-ok-bg px-3 py-2 text-sm text-status-ok">
                        <p className="text-xs text-status-ok">Novo valor calculado</p>
                        <p className="font-semibold">{formatCurrency(valorOrcamento)}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
              {novoStatus === "ENTREGUE" && (
                <div className="space-y-3">
                  <div className="rounded-md border bg-accent/40 px-3 py-2 text-sm">
                    Valor padrão de entrega (verificação técnica):{" "}
                    <strong>
                      {formatCurrency(valorFinalSugerido ?? valorFinal ?? 0)}
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
                    <ValorDecimalInput
                      aria-label="Valor final pago"
                      value={Number(valorFinal) || 0}
                      onValueChange={setValorFinal}
                      disabled={!acordoExcecaoEntrega}
                    />
                  </div>
                  {acordoExcecaoEntrega && valorFinalSugerido != null && valorFinal !== valorFinalSugerido && (
                    <p className="text-xs text-status-wait">
                      Exceção registrada: valor diferente da verificação técnica.
                    </p>
                  )}
                  <div className="space-y-3 rounded-lg border p-3">
                     <div className="flex items-center gap-2">
                        <div>
                          <Label htmlFor="equipamento-imagens-saida-entrega">Foto da saída (entrega)</Label>
                          <p className="text-xs text-muted-foreground">
                            Registre o estado final do equipamento no momento da entrega.
                          </p>
                        </div>
                        <div className="flex flex-col gap-1">
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
                            variant="outline"
                            size="sm"
                            className="gap-1.5 border-status-work/30 bg-status-work-bg text-status-work hover:bg-status-work-bg hover:text-status-work"
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
                            Via Celular
                          </Button>
                        </div>
                      </div>
                    {erroImagensSaidaEntrega && (
                      <p className="text-xs text-destructive">{erroImagensSaidaEntrega}</p>
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
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
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
            </div>
            <DialogFooter className="shrink-0 bg-card">
                <Button type="button" variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancelar</Button>
                <Button type="button" onClick={iniciarConfirmacaoStatus} disabled={confirmarStatusBloqueado(selecionado)}>
                  {salvando ? "Salvando..." : correcaoStatus ? "Corrigir status" : "Confirmar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={consumosDialogOpen} onOpenChange={(aberto) => { setConsumosDialogOpen(aberto); if (!aberto) setRecargaPendentes((n) => n + 1); }}>
        <DialogContent tamanho="m">
          <DialogHeader><DialogTitle>Peças da OS</DialogTitle><DialogDescription>Reposições ficam disponíveis no estoque. Confirme aqui o consumo das peças pendentes.</DialogDescription></DialogHeader>
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {consumosDetalhes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma peça vinculada a serviços aprovados.</p>}
            {consumosDetalhes.map((consumo) => (
              <div key={`${consumo.verificacao_id}:${consumo.servico_id}:${consumo.produto_id}`} className="rounded-md border p-2 text-sm">
                <p className="font-medium">{consumo.nome}</p>
                <p>{consumo.quantidade_baixada} baixada(s) de {consumo.quantidade_aprovada} aprovada(s)
                  {consumo.quantidade_baixada < consumo.quantidade_aprovada && <span className="text-status-wait"> · pendente</span>}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setConsumosDialogOpen(false); setRecargaPendentes((n) => n + 1); }}>Fechar</Button>
            <Button type="button" disabled={baixandoPendentes || !consumosDetalhes.some((c) => c.quantidade_baixada < c.quantidade_aprovada)}
              onClick={() => void confirmarBaixaPendente()}>Confirmar baixa pendente</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selecaoServicosOpen} onOpenChange={setSelecaoServicosOpen}>
        <DialogContent tamanho="m" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Decisão do cliente sobre o orçamento</DialogTitle><DialogDescription>Registre a decisão do cliente antes de movimentar o estoque.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {servicosAprovacao.length === 0 ? (
              <>
                <p className="text-sm">Este orçamento antigo não possui serviços detalhados. O cliente aprovou o valor total?</p>
                <p className="text-sm text-muted-foreground">A aprovação preserva o valor do orçamento e a forma de pagamento, sem baixar peças do estoque.</p>
              </>
            ) : (
              <>
                <p className="text-sm">Todos os serviços de troca foram aprovados?</p>
                <p className="text-sm text-muted-foreground">A seleção inclui todos os serviços do orçamento. Somente peças dos serviços aprovados serão baixadas. Serviços não selecionados serão reprovados, sem baixa. Se faltar estoque, a quantidade restante ficará pendente de confirmação na OS.</p>
              </>
            )}
            {pagamentoAprovacaoError && <p role="alert" className="text-sm text-destructive">{pagamentoAprovacaoError}</p>}
            <div className="flex gap-2">
              <Button type="button" variant={todosServicosAprovados === true ? "default" : "outline"}
                onClick={() => { setTodosServicosAprovados(true); setIdsAprovados(servicosAprovacao.map((s) => s.id)); }}>{servicosAprovacao.length === 0 ? "Aprovar orçamento" : "Sim, todos"}</Button>
              <Button type="button" variant={todosServicosAprovados === false ? "default" : "outline"}
                onClick={() => { setTodosServicosAprovados(false); setIdsAprovados([]); }}>{servicosAprovacao.length === 0 ? "Reprovar orçamento" : "Não, selecionar"}</Button>
            </div>
            {respostaClienteDecisao && (
              <div className="rounded-md border border-status-wait/30 bg-status-wait-bg p-3 text-sm text-status-wait">
                <p>O cliente respondeu pelo link: <strong>{respostaClienteDecisao === "APROVAR" ? "aprovou" : "recusou"}</strong> o orçamento.</p>
                {decisaoDivergeDoCliente && (
                  <div className="mt-2 space-y-1">
                    <Label htmlFor="motivo-divergencia">Motivo da divergência *</Label>
                    <Textarea
                      id="motivo-divergencia"
                      value={motivoDivergencia}
                      onChange={(event) => setMotivoDivergencia(event.target.value)}
                      placeholder="Ex.: cliente ligou e pediu para aprovar mesmo assim"
                    />
                    <p className="text-xs">A decisão aplicada é diferente da resposta do cliente. O motivo fica registrado na auditoria.</p>
                  </div>
                )}
              </div>
            )}
            {todosServicosAprovados === false && servicosAprovacao.length > 0 && (
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border p-3">
                {servicosAprovacao.map((servico) => (
                  <label key={servico.id} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" checked={idsAprovados.includes(servico.id)}
                      onChange={(event) => setIdsAprovados((ids) => event.target.checked
                        ? [...ids, servico.id] : ids.filter((id) => id !== servico.id))} />
                    <span>{servico.descricao} · {formatCurrency(Number(servico.valor || 0))}</span>
                  </label>
                ))}
              </div>
            )}
            {servicosAprovacao.length === 0 && (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <p className="font-semibold">Valor do orçamento: {formatCurrency(totalOrcamentoAprovacao ?? 0)}</p>
                <p className="mt-1 text-muted-foreground">A aprovação preserva o valor do equipamento e não baixa peças do estoque.</p>
              </div>
            )}
            {todosServicosAprovados !== null && (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                {servicosAprovacao.length > 0 && <p className="font-medium">{idsAprovados.length} de {servicosAprovacao.length} serviços aprovados</p>}
                {resumirPecas(servicosAprovacao.filter((s) => idsAprovados.includes(s.id))).map((peca, i) => {
                  const saldo = produtosAprovacao.find((p) => p.id === peca.produto_id)?.quantidade_estoque ?? 0;
                  return <p key={`${peca.produto_id}-${i}`} className={saldo < peca.quantidade ? "text-status-wait" : ""}>
                    {peca.nome}: {peca.quantidade} necessária(s), saldo {saldo}{saldo < peca.quantidade ? " · pendência" : ""}
                  </p>;
                })}
                {servicosAprovacao.length > 0 && <p className="mt-2 font-semibold">Total aprovado: {formatCurrency(idsAprovados.length === servicosAprovacao.length && totalOrcamentoAprovacao != null && totalOrcamentoAprovacao > 0 ? totalOrcamentoAprovacao : servicosAprovacao
                  .filter((s) => idsAprovados.includes(s.id))
                  .reduce((total, s) => total + Number(s.valor || 0) + (s.pecas ?? [])
                    .reduce((subtotal, p) => subtotal + p.quantidade * p.valor_unitario, 0), 0))}</p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelecaoServicosOpen(false)}>Cancelar</Button>
            <Button type="button" disabled={todosServicosAprovados === null || pagamentoAprovacaoLoading || (decisaoDivergeDoCliente && !motivoDivergenciaValido)}
              onClick={() => {
                if (decisaoAprovada) {
                  setSelecaoServicosOpen(false);
                  setPagamentoDialogOpen(true);
                } else {
                  void confirmarAprovacao({ codigo: "A_COMBINAR" }).then((ok) => { if (ok) setSelecaoServicosOpen(false); });
                }
              }}>{todosServicosAprovados === null ? "Selecione uma decisão" : decisaoAprovada ? "Continuar para pagamento" : "Confirmar reprovação"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PagamentoOrcamentoDialog
        open={pagamentoDialogOpen}
        loading={pagamentoAprovacaoLoading}
        error={pagamentoAprovacaoError}
        initialCodigo={pagamentoAprovacaoInicial?.codigo}
        initialDetalhe={pagamentoAprovacaoInicial?.detalhe}
        onOpenChange={(open) => {
          setPagamentoDialogOpen(open);
          if (!open) setPagamentoAprovacaoError(null);
        }}
        onConfirm={confirmarAprovacao}
      />

      {/* ═══ Dialog Exclusão ═══ */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent tamanho="p">
          <span aria-hidden="true" className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-status-bad-bg text-status-bad">
            <Trash2 className="h-[22px] w-[22px]" />
          </span>
          <DialogTitle>Confirmar Exclusão</DialogTitle>
          <div className="space-y-1">
            <p className="text-muted-foreground">Excluir <strong className="text-foreground">{deletando?.marca} {deletando?.modelo}</strong> (SN: {deletando?.serial_number})?</p>
            <p className="text-sm text-destructive">Esta ação não pode ser desfeita.</p>
          </div>
          <DialogFooter className="!border-t-0 !pt-2">
            <DialogClose asChild><Button variant="outline">Cancelar</Button></DialogClose>
            <Button variant="destructive" onClick={onDelete} disabled={salvando}>{salvando ? "Excluindo..." : "Excluir"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(imagemExpandida)} onOpenChange={(open) => { if (!open) setImagemExpandida(null); }}>
        <DialogContent tamanho="visualizador">
          <DialogHeader>
            <DialogTitle>Visualização da imagem</DialogTitle>
            {imagemExpandida && <DialogDescription className="truncate">{imagemExpandida.filename}</DialogDescription>}
          </DialogHeader>
          {imagemExpandida && (
            <>
              <DialogBody>
                <div className="flex min-h-[40vh] items-center justify-center rounded-xl bg-muted p-2">
                  <img
                    src={imagemExpandida.preview_url}
                    alt={imagemExpandida.filename}
                    className="mx-auto h-auto max-h-[65vh] w-auto rounded-lg"
                  />
                </div>
              </DialogBody>
              <DialogFooter>
                <Button className="gap-1" onClick={() => void exportarImagemEquipamento(imagemExpandida)}>
                  <Download className="h-3.5 w-3.5" />Exportar imagem
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={confirmProps.title}
        description={confirmProps.description}
        variant={confirmProps.variant}
        cancelVariant={confirmProps.cancelVariant}
        confirmLabel={confirmProps.confirmLabel}
        cancelLabel={confirmProps.cancelLabel}
        onConfirm={() => {
          confirmProps.onConfirm();
          setConfirmOpen(false);
        }}
        onCancel={confirmProps.onCancel}
      />

      <EnvioManualOrcamentoDialog
        envio={envioManual}
        onFechar={() => setEnvioManual(null)}
        onGerarNovaSenha={gerarNovaSenhaDoEnvioManual}
      />
      {quemRecebe && (
        <QuemRecebeOrcamentoDialog
          open
          equipamento={quemRecebe.eq}
          sugestao={quemRecebe.sugestao}
          onSalvo={async (eqAtualizado) => {
            const { continuar } = quemRecebe;
            setQuemRecebe(null);
            await continuar(eqAtualizado);
          }}
          onCancelar={() => setQuemRecebe(null)}
        />
      )}
      <CommunicationEmailDialog
        open={emailDialogOpen}
        recipient={emailFlow?.recipient || null}
        onOpenChange={(open) => {
          setEmailDialogOpen(open);
          if (!open) setEmailFlow(null);
        }}
        onConfirm={async (email, salvar) => {
          if (!emailFlow) return;
          return emailFlow.onConfirm(email, salvar);
        }}
        onSkip={async () => {
          await emailFlow?.onSkip();
        }}
      />
      <InputDialog
        open={marcaOutroOpen}
        onOpenChange={setMarcaOutroOpen}
        title="Informar outra marca"
        label="Marca do equipamento"
        placeholder="Ex.: Honeywell"
        onConfirm={(value) => form.setValue("marca", value.trim(), { shouldDirty: true, shouldValidate: true })}
        validate={(value) => value.trim().length >= 2 ? null : "Informe a marca do equipamento."}
      />
      <InputDialog
        open={tipoOutroOpen}
        onOpenChange={setTipoOutroOpen}
        title="Informar outro tipo"
        label="Tipo do equipamento"
        placeholder="Ex.: Terminal móvel"
        onConfirm={(value) => form.setValue("tipo", value.trim(), { shouldDirty: true, shouldValidate: true })}
        validate={(value) => value.trim().length >= 2 ? null : "Informe o tipo do equipamento."}
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
          if (fotoEdicaoSeq.current !== sequenciaFotoFormulario) return;
          const previewUrl = await bytesParaDataUrl(data.bytes, data.mime_type);
          if (fotoEdicaoSeq.current !== sequenciaFotoFormulario) return;
          const nextOrdem = imagensFormulario
            .filter((img) => img.categoria === data.categoria)
            .reduce((max, img) => Math.max(max, img.ordem), -1) + 1;
          const draft: EquipamentoImagemDraft = {
            local_id: crypto.randomUUID?.() || `imagem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            categoria: data.categoria as EquipamentoImagemCategoria,
            filename: data.filename,
            mime_type: data.mime_type,
            tamanho_bytes: previewUrl.length,
            ordem: nextOrdem,
            storage_path: previewUrl,
            preview_url: previewUrl,
          };
          setImagensFormulario((prev) => [...prev, draft]);
        } : undefined}
      />

      <PdfPreviewDialog
        artifact={pdfPreview?.artifact || null}
        onOpenChange={(open) => {
          if (!open) {
            setPdfPreview(null);
            setPdfPrazoUpdating(false);
          }
        }}
        prazoExecucao={pdfPreview?.tipo === "orcamento" && pdfPreview.verificacao ? {
          minDiasUteis: pdfPreview.prazoMin ?? PRAZO_EXECUCAO_PADRAO.minDiasUteis,
          maxDiasUteis: pdfPreview.prazoMax ?? PRAZO_EXECUCAO_PADRAO.maxDiasUteis,
          updating: pdfPrazoUpdating,
          onChange: async (minDiasUteis, maxDiasUteis) => {
            if (!pdfPreview.verificacao) return;
            setPdfPrazoUpdating(true);
            try {
              const artifact = await PdfService.construirOrcamentoAjustado(
                pdfPreview.equipamento,
                pdfPreview.verificacao,
                pdfPreview.artifact.filename,
                { minDiasUteis, maxDiasUteis },
              );
              if (!artifact) return;
              setPdfPreview((atual) => atual && atual.tipo === "orcamento"
                ? { ...atual, artifact, prazoMin: minDiasUteis, prazoMax: maxDiasUteis }
                : atual);
              return artifact;
            } finally {
              setPdfPrazoUpdating(false);
            }
          },
        } : undefined}
        onDownload={async (artifact) => {
          if (!pdfPreview) return;
          const { equipamento, tipo } = pdfPreview;
          if (tipo === "orcamento") {
            await PdfService.salvarOrcamento(artifact, equipamento);
          } else if (tipo === "ordem") {
            await PdfService.salvarOrdemServico(artifact, equipamento);
          } else {
            await PdfService.salvarRelatorioStatus(artifact, equipamento);
          }
        }}
        // Imprimir sem baixar também publica OS/orçamento; publicarPdfOficial é idempotente por artefato.
        onBeforePrint={pdfPreview && pdfPreview.tipo !== "relatorio"
          ? (artifact) => publicarPdfOficial(artifact, pdfPreview.equipamento)
          : undefined}
      />
    </div>
  );
}
