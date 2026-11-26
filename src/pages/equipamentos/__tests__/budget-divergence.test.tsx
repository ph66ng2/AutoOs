/**
 * Testes de divergência de orçamento no fluxo de ajuste de status
 *
 * Cobre:
 * - Detecção de divergência entre soma de serviços/peças e valor total informado
 * - Diálogo de divergência com Sim/Não para mudar o total à soma dos itens
 * - Flag divergence passada para db.atualizarServicosVerificacao
 * - Indicador "Histórico de Ajustes" quando adjusted_at está presente
 * - Verificação dos parâmetros do audit (old_total, new_total, services counts)
 */
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from "vitest";
import { render, screen, act, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { distribuirMudancas } from "@/lib/ao-vivo";
import * as equipamentoImagemUtils from "@/lib/equipamento-imagem-utils";

// ─── Hoisted Mocks ──────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn(() => Promise.resolve(vi.fn())));
const rota = vi.hoisted(() => ({ pathname: "/equipamentos" }));
const mockNavigate = vi.hoisted(() => vi.fn());

const mockFinalizarVerificacao = vi.hoisted(() => vi.fn());
const mockMarcarPronto = vi.hoisted(() => vi.fn());
const mockPermissions = vi.hoisted(() => ({ list: ["FINANCIAL_ACTIONS"] as string[] }));
const mockEnsureSensitiveAccess = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const mockAtualizarServicosVerificacao = vi.hoisted(() => vi.fn());
const mockProrrogarPrazoOrcamento = vi.hoisted(() => vi.fn());
const mockAnalisarAjusteOrcamento = vi.hoisted(() => vi.fn());
const mockAprovarOrcamento = vi.hoisted(() => vi.fn());
const mockAtualizarStatusEquipamento = vi.hoisted(() => vi.fn());
const mockEnviarOrcamentoEmail = vi.hoisted(() => vi.fn());
const mockBuscarEquipamento = vi.hoisted(() => vi.fn().mockResolvedValue({ atualizado_em: "2024-01-15T10:00:01Z" }));
const mockListarPecasBaixaPendente = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockBuscarVerificacao = vi.hoisted(() => vi.fn());
const mockListarServicosCatalogoAtivos = vi.hoisted(() => vi.fn());
const mockListarImagensEquipamento = vi.hoisted(() => vi.fn());
const mockBuscarEquipamentosPorSerial = vi.hoisted(() => vi.fn());
const mockBuscarCliente = vi.hoisted(() => vi.fn());
const mockRecarregar = vi.hoisted(() => vi.fn());
const mockAtualizarEquipamento = vi.hoisted(() => vi.fn());
const mockSubstituirImagensEquipamento = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ state: {}, pathname: rota.pathname }),
  useNavigate: () => mockNavigate,
}));

vi.mock("@/hooks/useEquipamentos", () => ({
  useEquipamentos: () => ({
    equipamentos: mockEquipamentos,
    total: 1,
    loading: false,
    error: null,
    avisoAtualizacao: null,
    criar: vi.fn(),
    atualizar: (...args: unknown[]) => mockAtualizarEquipamento(...args),
    deletar: vi.fn(),
    atualizarStatus: mockAtualizarStatusEquipamento,
    recarregar: mockRecarregar,
  }),
}));

vi.mock("@/hooks/useStatusEquipamento", () => ({
  useStatusEquipamento: () => ({
    loading: false,
    finalizarVerificacao: mockFinalizarVerificacao,
    marcarComoPronto: mockMarcarPronto,
  }),
}));

vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({
    ensureSensitiveAccess: (...args: unknown[]) => mockEnsureSensitiveAccess(...args),
    status: { active_profile_id: 901, unlocked: true, permissions: mockPermissions.list },
    hasPermission: (permission: string) => mockPermissions.list.includes(permission),
  }),
}));

const mockNotificacao = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}));

vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => mockNotificacao,
}));

vi.mock("@/lib/db", () => ({
  db: {
    prorrogarPrazoOrcamento: mockProrrogarPrazoOrcamento,
    listarProdutos: vi.fn().mockResolvedValue([]),
    buscarEquipamento: mockBuscarEquipamento,
    listarPecasBaixaPendente: mockListarPecasBaixaPendente,
    obterDestinatarioOrcamento: vi.fn().mockResolvedValue({ contatoId: null, nome: "Cliente A", email: "a@ex.com" }),
    buscarVerificacao: (...args: unknown[]) => mockBuscarVerificacao(...args),
    listarServicosCatalogoAtivos: (...args: unknown[]) => mockListarServicosCatalogoAtivos(...args),
    atualizarServicosVerificacao: (...args: unknown[]) => mockAtualizarServicosVerificacao(...args),
    analisarAjusteOrcamento: (...args: unknown[]) => mockAnalisarAjusteOrcamento(...args),
    aprovarOrcamento: (...args: unknown[]) => mockAprovarOrcamento(...args),
    obterDecisaoOrcamento: () => Promise.resolve(null),
    atualizarStatusEquipamento: (...args: unknown[]) => mockAtualizarStatusEquipamento(...args),
    listarImagensEquipamento: (...args: unknown[]) => mockListarImagensEquipamento(...args),
    buscarEquipamentosPorSerial: (...args: unknown[]) => mockBuscarEquipamentosPorSerial(...args),
    buscarCliente: (...args: unknown[]) => mockBuscarCliente(...args),
    listarComunicacoes: vi.fn().mockResolvedValue([]),
    listarHistoricoEquipamento: vi.fn().mockResolvedValue([]),
    listarEquipamentos: vi.fn().mockResolvedValue([]),
    listarEquipamentosPaginados: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    substituirImagensEquipamento: (...args: unknown[]) => mockSubstituirImagensEquipamento(...args),
  },
}));

const mockPdfService = vi.hoisted(() => ({
  gerarOrcamento: vi.fn(),
  gerarOrdemServico: vi.fn(),
  gerarRelatorioStatus: vi.fn(),
  construirOrcamentoAjustado: vi.fn(),
  construirOrdemServico: vi.fn(),
  construirRelatorioStatus: vi.fn(),
  salvarOrcamento: vi.fn(),
}));
const mockPublicarPdfOficial = vi.hoisted(() => vi.fn());
const mockReferenciaPdfPortal = vi.hoisted(() => vi.fn());
type PdfPreviewPropsTeste = {
  artifact: unknown;
  onBeforePrint?: (artifact: unknown) => Promise<void> | void;
  onDownload?: (artifact: unknown) => Promise<void> | void;
};
const pdfPreviewProps = vi.hoisted(() => ({
  current: null as null | PdfPreviewPropsTeste,
}));

vi.mock("@/lib/pdf-service", () => ({
  PRAZO_EXECUCAO_PADRAO: { minDiasUteis: 2, maxDiasUteis: 4 },
  PdfService: mockPdfService,
}));

vi.mock("@/lib/portal-documentos", () => ({
  publicarPdfOficial: (...args: unknown[]) => mockPublicarPdfOficial(...args),
  referenciaPdfPortal: (...args: unknown[]) => mockReferenciaPdfPortal(...args),
}));

vi.mock("@/components/equipamentos/PdfPreviewDialog", () => ({
  PdfPreviewDialog: (props: PdfPreviewPropsTeste) => {
    pdfPreviewProps.current = props;
    return null;
  },
}));

vi.mock("@/lib/email-service", () => ({
  EmailService: {
    enviarOrdemEntrada: vi.fn(),
    enviarOrcamento: mockEnviarOrcamentoEmail,
  },
}));

vi.mock("@/lib/whatsapp-service", () => ({
  WhatsAppService: {
    enviarOrcamento: vi.fn(),
    enviarEquipamentoPronto: vi.fn(),
  },
}));

vi.mock("@/components/equipamentos/ClienteSelector", () => ({
  ClienteSelector: ({ onClienteSelecionado }: { onClienteSelecionado?: (cliente: unknown) => void }) => (
    <div data-testid="cliente-selector">
      <button type="button" onClick={() => onClienteSelecionado?.({ id: 999, nome: "Outro cliente", empresa_id: 1 })}>
        Trocar cliente (teste)
      </button>
    </div>
  ),
}));

vi.mock("@/components/equipamentos/ContatoResponsavelSelector", () => ({
  ContatoResponsavelSelector: () => <div data-testid="contato-responsavel-selector" />,
}));

vi.mock("@/components/equipamentos/CorrigirDecisaoDialog", () => ({
  CorrigirDecisaoDialog: () => null,
}));

vi.mock("@/components/equipamentos/PhotoUploadDialog", () => ({
  PhotoUploadDialog: ({ open, onPhotoData }: any) => (
    <div data-testid="photo-upload-dialog">
      {open && onPhotoData && <button type="button" data-testid="emitir-foto-celular" onClick={() => void onPhotoData({
        bytes: [1, 2, 3],
        mime_type: "image/jpeg",
        categoria: "ENTRADA",
        filename: "foto-celular.jpg",
      })}>Emitir foto de teste</button>}
    </div>
  ),
}));

vi.mock("@/components/equipamentos/VerificacaoTecnica", () => ({
  VerificacaoTecnica: ({ open, equipamento }: { open: boolean; equipamento: { id: number } }) =>
    open ? <div data-testid="verificacao-tecnica">Verificação da OS {equipamento.id}</div> : null,
}));

vi.mock("@/components/equipamentos/HistoricoComunicacoes", () => ({
  HistoricoComunicacoes: () => <div data-testid="historico-comunicacoes" />,
}));

vi.mock("@/components/equipamentos/DocumentosEquipamento", () => ({
  DocumentosEquipamento: () => <div data-testid="documentos-equipamento" />,
}));

vi.mock("@/components/equipamentos/AjusteOrcamentoServicos", () => ({
  AjusteOrcamentoServicos: ({ servicos }: any) => (
    <div data-testid="ajuste-orcamento-servicos">
      {servicos.length} serviço(s)
    </div>
  ),
}));

vi.mock("@/components/ui/action-priority-row", () => ({
  ActionPriorityRow: ({ primary, secondary, overflow }: any) => (
    <div data-testid="action-priority-row">
      {primary && (
        <button data-testid={`action-${primary.id}`} onClick={primary.onClick} disabled={primary.disabled}>
          {primary.label}
        </button>
      )}
      {secondary && (
        <button data-testid={`action-${secondary.id}`} onClick={secondary.onClick}>
          {secondary.label}
        </button>
      )}
      {overflow?.map((a: any) => (
        <button key={a.id} data-testid={`action-${a.id}`} onClick={a.onClick} disabled={a.disabled}>
          {a.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/pages/equipamentos/EquipamentosPageGallery", () => ({
  GaleriaImagensEquipamento: ({ imagens, mensagemVazia, onRemover, onLegendaChange }: any) => (
    <div data-testid="galeria-imagens">
      {imagens.length === 0 && <span>{mensagemVazia}</span>}
      {imagens.map((imagem: any) => (
        <div key={imagem.local_id}>
          <span>{imagem.filename}</span>
          {onRemover && <button type="button" aria-label={`Remover ${imagem.filename}`} onClick={() => onRemover(imagem)}>Remover</button>}
          {onLegendaChange && <textarea aria-label={`Legenda ${imagem.filename}`} value={imagem.observacao || ""} onChange={(event) => onLegendaChange(imagem, event.target.value)} />}
        </div>
      ))}
    </div>
  ),
}));

vi.mock("@/pages/equipamentos/EquipamentosStatusBadge", () => ({
  StatusBadge: ({ status }: any) => <span data-testid="status-badge">{status}</span>,
}));

vi.mock("@/components/ui/input-dialog", () => ({
  InputDialog: () => <div data-testid="input-dialog" />,
}));

vi.mock("@/components/ui/error-alert", () => ({
  ErrorAlert: ({ message }: any) => <div data-testid="error-alert">{message}</div>,
}));

vi.mock("@/components/ui/form-validation-error", () => ({
  FormValidationError: () => <div data-testid="form-validation-error" />,
}));

// Mock confirm-dialog to expose testable surface
vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({ open, title, description, confirmLabel, cancelLabel, variant, onConfirm, onCancel }: any) => {
    if (!open) return null;
    return (
      <div data-testid="confirm-dialog" data-variant={variant}>
        <h3 data-testid="confirm-title">{title}</h3>
        <p data-testid="confirm-description">{description}</p>
        <button data-testid="confirm-cancel" onClick={() => { if (onCancel) onCancel(); }}>
          {cancelLabel || "Cancelar"}
        </button>
        <button data-testid="confirm-action" onClick={onConfirm}>
          {confirmLabel || "Confirmar"}
        </button>
      </div>
    );
  },
}));

// ─── Fixtures ───────────────────────────────────────────

const equipamentoVerificado = {
  id: 10,
  marca: "Zebra",
  modelo: "ZT230",
  serial_number: "SN001",
  tipo: "Impressora",
  defeito_relatado: "Não liga",
  status: "VERIFICADO",
  cliente_id: 1,
  empresa_id: 7,
  cliente_nome: "Cliente A",
  cliente_telefone: "11999990001",
  cliente_email: "a@ex.com",
  valor_orcamento: 150,
  prazo_aprovacao: null,
  data_entrada: "2024-01-15",
  atualizado_em: "2024-01-15T10:00:00Z",
};

const mockEquipamentos = [equipamentoVerificado];

function makeVerificacao(opts?: { adjusted_at?: string; servicos?: any[]; pecas?: any[]; custo_total?: number; observacoes?: string }) {
  return {
    id: 100,
    equipamento_id: 10,
    tecnico_nome: "Ivan",
    problema_relatado: "Não liga",
    diagnostico: "Fonte queimada",
    servicos_necessarios: JSON.stringify(opts?.servicos ?? [
      { id: "s1", descricao: "Troca de fonte", valor: 100 },
    ]),
    pecas_necessarias: JSON.stringify(opts?.pecas ?? [
      { id: "p1", nome: "Fonte 24V", quantidade: 1, valorTotal: 50 },
    ]),
    custo_total: opts?.custo_total ?? 150,
    tempo_estimado: 2,
    concluida: true,
    observacoes: opts?.observacoes ?? "",
    adjusted_at: opts?.adjusted_at ?? null,
    adjusted_by_profile_id: opts?.adjusted_at ? 1 : null,
  };
}

// ─── Import Component ───────────────────────────────────

import Equipamentos from "../../Equipamentos";
import { semearTecnicosPadrao } from "@/test/tecnicos-fixture";

beforeEach(() => semearTecnicosPadrao());

describe("Equipamentos — Budget Divergence & Audit", () => {
  beforeEach(() => {
    rota.pathname = "/equipamentos";
    mockNavigate.mockImplementation((destino: string) => {
      if (destino.endsWith("/orcamento") || destino.endsWith("/verificacao")) rota.pathname = destino;
    });
    vi.clearAllMocks();
    mockAtualizarEquipamento.mockResolvedValue({
      sucesso: true,
      data: { ...equipamentoVerificado, atualizado_em: "2024-01-15T10:00:01Z" },
    });
    mockSubstituirImagensEquipamento.mockResolvedValue([]);
    mockFinalizarVerificacao.mockResolvedValue({ sucesso: true });
    mockMarcarPronto.mockResolvedValue({ sucesso: true });
    mockPermissions.list = ["FINANCIAL_ACTIONS"];
    mockEnsureSensitiveAccess.mockResolvedValue(true);
    equipamentoVerificado.status = "VERIFICADO";
    equipamentoVerificado.prazo_aprovacao = null;
    equipamentoVerificado.valor_orcamento = 150;
    mockListarImagensEquipamento.mockResolvedValue([]);
    mockBuscarEquipamentosPorSerial.mockResolvedValue([]);
    mockBuscarCliente.mockRejectedValue(new Error("no client"));
    mockListarServicosCatalogoAtivos.mockResolvedValue([]);
    mockAtualizarServicosVerificacao.mockResolvedValue(makeVerificacao());
    mockAnalisarAjusteOrcamento.mockResolvedValue({
      status: "VERIFICADO",
      podePedirNovaAprovacao: false,
      jaPublicado: false,
      respostaPendente: null,
      pecasBaixadas: [],
      totalBaixado: 0,
      exigeDecisaoEstoque: false,
    });
    mockAprovarOrcamento.mockResolvedValue({ ...equipamentoVerificado, status: "APROVADO" });
    mockAtualizarStatusEquipamento.mockResolvedValue({ sucesso: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reconsulta baixas pendentes em segundo plano ao receber mudança da OS aberta", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    mockBuscarEquipamento.mockResolvedValueOnce(equipamentoVerificado);
    render(<Equipamentos />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhes de Zebra ZT230" }));
    await waitFor(() => expect(mockListarPecasBaixaPendente).toHaveBeenCalledWith(10, false));

    act(() => distribuirMudancas([{ tabela: "equipamentos", id: 10, referencia: null, operacao: "U" }]));
    await waitFor(() => expect(mockListarPecasBaixaPendente).toHaveBeenLastCalledWith(10, true));
  });

  it("recarga ao vivo da OS aberta é uma de cada vez: evento durante a leitura vira uma nova leitura depois", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    mockBuscarEquipamento.mockResolvedValue(equipamentoVerificado);
    onTestFinished(() => { mockBuscarEquipamento.mockResolvedValue({ atualizado_em: "2024-01-15T10:00:01Z" }); });
    render(<Equipamentos />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir detalhes de Zebra ZT230" }));
    await waitFor(() => expect(mockListarPecasBaixaPendente).toHaveBeenCalledWith(10, false));
    await new Promise((r) => setTimeout(r, 50));

    let liberar!: (valor: unknown) => void;
    const chamadasAntes = mockBuscarEquipamento.mock.calls.length;
    mockBuscarEquipamento.mockImplementationOnce(() => new Promise((resolve) => { liberar = resolve; }));
    act(() => distribuirMudancas([{ tabela: "equipamentos", id: 10, referencia: null, operacao: "U" }]));
    await waitFor(() => expect(mockBuscarEquipamento.mock.calls.length).toBe(chamadasAntes + 1));

    // Dois avisos com a leitura ainda em voo: nenhuma leitura paralela.
    act(() => distribuirMudancas([{ tabela: "equipamentos", id: 10, referencia: null, operacao: "U" }]));
    act(() => distribuirMudancas([{ tabela: "equipamentos", id: 10, referencia: null, operacao: "U" }]));
    await new Promise((r) => setTimeout(r, 400));
    expect(mockBuscarEquipamento.mock.calls.length).toBe(chamadasAntes + 1);

    // A leitura antiga termina; depois dela vem exatamente uma nova.
    await act(async () => { liberar({ ...equipamentoVerificado, atualizado_em: "2026-11-24T04:00:00Z" }); });
    await waitFor(() => expect(mockBuscarEquipamento.mock.calls.length).toBe(chamadasAntes + 2));
    await new Promise((r) => setTimeout(r, 100));
    expect(mockBuscarEquipamento.mock.calls.length).toBe(chamadasAntes + 2);
  });

  // ─── Helpers ─────────────────────────────────────────

  async function abrirDialogoAjusteOrcamento() {
    render(<Equipamentos />);
    await waitFor(() => {
      expect(screen.getByTestId("action-enviar_orcamento")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("action-enviar_orcamento"));
    });

    // Aguarda o diálogo de status abrir
    await waitFor(() => {
      expect(screen.getByText(/Ajuste de Orçamento/i)).toBeInTheDocument();
    });
  }

  async function alterarValorOrcamento(novoValor: number) {
    const input = screen.getByTestId("valor-orcamento-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: String(novoValor) } });
    });
  }

  async function clicarConfirmarStatus() {
    const btn = screen.getByRole("button", { name: /Confirmar/i });
    await act(async () => {
      fireEvent.click(btn);
    });
  }

  // ─── Test 1: Sem divergência — fluxo normal ──────────

  it("o Cancelar fecha o ajuste de orçamento", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => {
      expect(screen.queryByText(/Ajuste de Orçamento/i)).not.toBeInTheDocument();
    });
  });

  it("aceita milhar e vírgula no valor do orçamento", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();
    const input = screen.getByTestId("valor-orcamento-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "1.234,50" } });
    });
    expect(screen.getByText(/Novo valor em negociação: R\$\s*1\.234,50/)).toBeInTheDocument();
  });

  it("não exibe diálogo de divergência quando soma coincide com valor total", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();

    // Valor padrão: serviços 100 + peças 50 = 150 (coincide)
    await clicarConfirmarStatus();

    // Deve mostrar o resumo normal (ConfirmDialog com título de resumo)
    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
    expect(screen.getByTestId("confirm-title")).toHaveTextContent(/Resumo do Ajuste/i);
    expect(screen.getByTestId("confirm-description")).toHaveTextContent(/Valor original:/);
    expect(screen.getByTestId("confirm-description")).toHaveTextContent(/Novo valor:/);
    expect(screen.getByTestId("confirm-description")).toHaveTextContent(/Diferença:/);
    expect(screen.getByTestId("confirm-description")).toHaveTextContent(/150,00/);
  });

  it("resumo usa o valor atual vigente, não o original da verificação", async () => {
    equipamentoVerificado.valor_orcamento = 1300;
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({
      servicos: [{ id: "s1", descricao: "Troca de fonte", valor: 1300 }],
      pecas: [],
      custo_total: 1234.5,
    }));
    await abrirDialogoAjusteOrcamento();
    await clicarConfirmarStatus();
    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
    const texto = screen.getByTestId("confirm-description").textContent || "";
    expect(texto).toMatch(/Valor original:[\s\S]*1\.300,00/);
    expect(texto).not.toMatch(/Valor original:[\s\S]*1\.234,50/);
  });

  // ─── Test 2: Divergência detectada ───────────────────

  it("exibe alerta de divergência quando soma dos serviços ≠ valor total informado", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();

    // Altera valor total para criar divergência: serviços 100 + peças 50 = 150, mas total = 200
    await alterarValorOrcamento(200);
    await clicarConfirmarStatus();

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    expect(screen.getByTestId("confirm-title")).toHaveTextContent(/Valor digitado/);
    expect(screen.getByTestId("confirm-title")).toHaveTextContent(/200,00/);
    expect(screen.getByTestId("confirm-title")).toHaveTextContent(/150,00/);
    expect(screen.getByTestId("confirm-description")).toHaveTextContent(/Sim grava a soma/);
    expect(screen.getByTestId("confirm-description")).toHaveTextContent(/Não grava o valor digitado/);
    expect(screen.getByTestId("confirm-cancel")).toHaveTextContent(/^Não$/);
    expect(screen.getByTestId("confirm-action")).toHaveTextContent(/^Sim$/);
  });

  // ─── Test 3: "Corrigir" ajusta o total para a soma ───

  it('"Sim" define valorOrcamento = soma e mostra resumo normal', async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();

    await alterarValorOrcamento(200);
    await clicarConfirmarStatus();

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
    });

    // O input de valor deve ter sido corrigido para 150
    const input = screen.getByTestId("valor-orcamento-input") as HTMLInputElement;
    expect(input.value).toBe("150,00");

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
    expect(screen.getByTestId("confirm-title")).toHaveTextContent(/Resumo do Ajuste/i);
  });

  // ─── Test 4: "Continuar" salva com divergence=true ───

  it('"Não" chama atualizarServicosVerificacao com divergence=true', async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();

    await alterarValorOrcamento(200);
    await clicarConfirmarStatus();

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-cancel"));
    });

    await waitFor(() => {
      expect(mockAtualizarServicosVerificacao).toHaveBeenCalled();
    });

    const call = mockAtualizarServicosVerificacao.mock.calls[0];
    const input = call[0];
    expect(input.divergence).toBe(true);
    expect(input.equipamento_id).toBe(10);
    expect(input.custo_total).toBe(200);
    expect(input.servicos).toHaveLength(1);
  });

  // ─── Test 5: Sem divergência — divergence=false ──────

  it("chama atualizarServicosVerificacao com divergence=false quando não há divergência", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();

    // Valor padrão 150 coincide com soma
    await clicarConfirmarStatus();

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    // Confirma o resumo
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
    });

    await waitFor(() => {
      expect(mockAtualizarServicosVerificacao).toHaveBeenCalled();
    });

    const call = mockAtualizarServicosVerificacao.mock.calls[0];
    const input = call[0];
    expect(input.divergence).toBe(false);
    expect(input.custo_total).toBe(150);
    await waitFor(() => {
      expect(mockAtualizarStatusEquipamento).toHaveBeenCalledWith(
        10,
        "AGUARDANDO_APROVACAO",
        150,
        undefined,
        undefined,
        "2024-01-15T10:00:01Z",
        undefined,
      );
    });
  });

  // ─── Test 6: Histórico de Ajustes indicador ──────────

  it('exibe indicador "Histórico de Ajustes" quando adjusted_at está presente', async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({ adjusted_at: "2024-06-20T14:30:00Z" }));
    await abrirDialogoAjusteOrcamento();

    expect(screen.getByText(/Histórico de Ajustes/i)).toBeInTheDocument();
    expect(screen.getByText(/20\/06\/2024/i)).toBeInTheDocument();
  });

  it('não exibe indicador "Histórico de Ajustes" quando adjusted_at está ausente', async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({ adjusted_at: null }));
    await abrirDialogoAjusteOrcamento();

    expect(screen.queryByText(/Histórico de Ajustes/i)).not.toBeInTheDocument();
  });

  it("exibe Observações e envia texto vazio quando o campo é apagado", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({ observacoes: "oii" }));
    await abrirDialogoAjusteOrcamento();

    expect(screen.queryByText(/Descrição do Serviço Técnico/i)).not.toBeInTheDocument();
    const campo = screen.getByLabelText(/^Observações$/i) as HTMLTextAreaElement;
    expect(campo).toHaveValue("oii");

    await act(async () => {
      fireEvent.change(campo, { target: { value: "" } });
    });
    expect(campo).toHaveValue("");

    await clicarConfirmarStatus();
    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
    });

    await waitFor(() => {
      expect(mockAtualizarServicosVerificacao).toHaveBeenCalled();
    });
    expect(mockAtualizarServicosVerificacao.mock.calls[0][0].observacoes).toBe("");
  });

  // ─── Test 7: Audit params verification ───────────────

  it("atualizarServicosVerificacao recebe os parâmetros necessários para o audit", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();

    await clicarConfirmarStatus();

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
    });

    await waitFor(() => {
      expect(mockAtualizarServicosVerificacao).toHaveBeenCalled();
    });

    const call = mockAtualizarServicosVerificacao.mock.calls[0];
    const input = call[0];
    const profileId = call[1];

    // Verifica que os dados necessários para o audit estão presentes
    expect(input.equipamento_id).toBe(10);
    expect(input.custo_total).toBe(150);
    expect(Array.isArray(input.servicos)).toBe(true);
    expect(Array.isArray(input.pecas)).toBe(true);
    expect(profileId).toBe(901);
  });

  // ─── Test 8: Divergência com peças zeradas ───────────

  it("detecta divergência mesmo quando não há peças", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({
      pecas: [],
      custo_total: 100,
    }));
    await abrirDialogoAjusteOrcamento();

    await alterarValorOrcamento(250);
    await clicarConfirmarStatus();

    await waitFor(() => {
      expect(screen.getByTestId("confirm-title")).toHaveTextContent(/Valor digitado/);
    });
    expect(screen.getByTestId("confirm-title")).toHaveTextContent(/250,00/);
    expect(screen.getByTestId("confirm-title")).toHaveTextContent(/100,00/);
    expect(screen.getByTestId("confirm-cancel")).toHaveTextContent(/^Não$/);
    expect(screen.getByTestId("confirm-action")).toHaveTextContent(/^Sim$/);
  });

  it("ajusta o orçamento durante a manutenção sem mudar o status", async () => {
    equipamentoVerificado.status = "EM_MANUTENCAO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    render(<Equipamentos />);

    await waitFor(() => {
      expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("action-alterar_orcamento"));
    });

    await waitFor(() => {
      expect(screen.getByText(/O status atual do equipamento será mantido/i)).toBeInTheDocument();
    });
    expect(screen.queryByText("Prazo Aprovação")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    await clicarConfirmarStatus();
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
    });

    await waitFor(() => {
      expect(mockAtualizarServicosVerificacao).toHaveBeenCalled();
      expect(mockRecarregar).toHaveBeenCalled();
    });
    expect(mockAtualizarStatusEquipamento).not.toHaveBeenCalled();
    expect(equipamentoVerificado.status).toBe("EM_MANUTENCAO");
  });

  it("Alterar Orçamento abre a página do ajuste, não uma janela", async () => {
    equipamentoVerificado.status = "EM_MANUTENCAO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId("action-alterar_orcamento"));
    });
    expect(await screen.findByRole("heading", { name: "Ajuste de orçamento" })).toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith(`/equipamentos/${equipamentoVerificado.id}/orcamento`);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Serviços e peças" })).toBeInTheDocument();
  });

  it("troca de OS na rota de orçamento recarrega os itens e salva na nova OS", async () => {
    rota.pathname = "/equipamentos/10/orcamento";
    const outraOs = { ...equipamentoVerificado, id: 11 };
    mockBuscarEquipamento
      .mockResolvedValueOnce(equipamentoVerificado)
      .mockResolvedValueOnce(outraOs)
      .mockResolvedValueOnce(outraOs);
    mockBuscarVerificacao
      .mockResolvedValueOnce(makeVerificacao())
      .mockResolvedValueOnce({
        ...makeVerificacao({
          servicos: [{ id: "s2", descricao: "Reparo da placa", valor: 100 }],
          pecas: [{ id: "p2", nome: "Placa lógica", quantidade: 1, valorTotal: 50 }],
        }),
        equipamento_id: 11,
      });
    const view = render(<Equipamentos />);
    expect(await screen.findByText(/Fonte 24V/)).toBeInTheDocument();

    rota.pathname = "/equipamentos/11/orcamento";
    view.rerender(<Equipamentos />);
    expect(screen.queryByText(/Fonte 24V/)).not.toBeInTheDocument();
    expect(await screen.findByText(/Placa lógica/)).toBeInTheDocument();
    expect(mockBuscarVerificacao).toHaveBeenLastCalledWith(11, equipamentoVerificado.empresa_id);

    await clicarConfirmarStatus();
    fireEvent.click(await screen.findByTestId("confirm-action"));
    await waitFor(() => expect(mockAtualizarServicosVerificacao).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/equipamentos/11"));
    expect(mockAtualizarServicosVerificacao.mock.calls[0][0]).toMatchObject({
      equipamento_id: 11,
      servicos: [expect.objectContaining({ descricao: "Reparo da placa" })],
    });
  });

  it("não prorroga o prazo da OS anterior se a rota mudar durante a busca da versão", async () => {
    rota.pathname = "/equipamentos/10/orcamento";
    const os = {
      ...equipamentoVerificado,
      status: "AGUARDANDO_APROVACAO",
      prazo_aprovacao: "2099-01-20",
    };
    let resolverVersao!: (value: typeof os) => void;
    const versaoPendente = new Promise<typeof os>((resolve) => { resolverVersao = resolve; });
    mockBuscarEquipamento
      .mockResolvedValueOnce(os)
      .mockReturnValueOnce(versaoPendente)
      .mockResolvedValueOnce({ ...os, id: 11 });
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    const view = render(<Equipamentos />);
    fireEvent.change(await screen.findByDisplayValue("20/01/2099"), { target: { value: "2099-01-21" } });
    await clicarConfirmarStatus();
    fireEvent.click(await screen.findByTestId("confirm-action"));
    await waitFor(() => expect(mockBuscarEquipamento).toHaveBeenNthCalledWith(2, 10));

    rota.pathname = "/equipamentos/11/orcamento";
    view.rerender(<Equipamentos />);
    await act(async () => resolverVersao(os));

    expect(mockAtualizarServicosVerificacao).toHaveBeenCalledTimes(1);
    expect(mockProrrogarPrazoOrcamento).not.toHaveBeenCalled();
    await waitFor(() => expect(mockNotificacao.warning).toHaveBeenCalledWith(
      "Equipamentos", "Orçamento salvo, mas o prazo não foi prorrogado.",
    ));
    expect(mockNotificacao.success).toHaveBeenCalledWith("Equipamentos", "Orçamento atualizado.", "Alterar orçamento");
  });

  it("avisa o orçamento salvo e o prazo não prorrogado se a rota mudar logo após gravar", async () => {
    rota.pathname = "/equipamentos/10/orcamento";
    const os = {
      ...equipamentoVerificado,
      status: "AGUARDANDO_APROVACAO",
      prazo_aprovacao: "2099-01-20",
    };
    mockBuscarEquipamento.mockResolvedValue(os);
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    let resolverGravacao!: (value: unknown) => void;
    mockAtualizarServicosVerificacao.mockReturnValueOnce(new Promise((resolve) => { resolverGravacao = resolve; }));
    const view = render(<Equipamentos />);
    fireEvent.change(await screen.findByDisplayValue("20/01/2099"), { target: { value: "2099-01-21" } });
    await clicarConfirmarStatus();
    fireEvent.click(await screen.findByTestId("confirm-action"));
    await waitFor(() => expect(mockAtualizarServicosVerificacao).toHaveBeenCalledTimes(1));

    rota.pathname = "/equipamentos/11/orcamento";
    view.rerender(<Equipamentos />);
    await act(async () => resolverGravacao({
      portal: { mensagem: "Portal atualizado.", aviso: "Avise o cliente da mudança." },
    }));

    await waitFor(() => expect(mockNotificacao.success).toHaveBeenCalledWith(
      "Equipamentos",
      expect.stringContaining("Orçamento atualizado. Portal atualizado."),
      "Alterar orçamento",
    ));
    expect(mockNotificacao.warning).toHaveBeenCalledWith("Equipamentos", "Orçamento salvo, mas o prazo não foi prorrogado.");
    expect(mockNotificacao.warning).toHaveBeenCalledWith("Equipamentos", "Avise o cliente da mudança.");
    expect(mockProrrogarPrazoOrcamento).not.toHaveBeenCalled();
  });

  it("troca de OS na rota de verificação abre a verificação da nova OS", async () => {
    rota.pathname = "/equipamentos/10/verificacao";
    mockBuscarEquipamento
      .mockResolvedValueOnce({ ...equipamentoVerificado, status: "EM_VERIFICACAO" })
      .mockResolvedValueOnce({ ...equipamentoVerificado, id: 11, status: "EM_VERIFICACAO" });
    const view = render(<Equipamentos />);
    expect(await screen.findByText("Verificação da OS 10")).toBeInTheDocument();

    rota.pathname = "/equipamentos/11/verificacao";
    view.rerender(<Equipamentos />);
    expect(screen.queryByText("Verificação da OS 10")).not.toBeInTheDocument();
    expect(await screen.findByText("Verificação da OS 11")).toBeInTheDocument();
  });

  it("orçamento aprovado alterado: pergunta o que fazer e envia o modo escolhido", async () => {
    equipamentoVerificado.status = "APROVADO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    mockAnalisarAjusteOrcamento.mockResolvedValue({
      status: "APROVADO",
      podePedirNovaAprovacao: true,
      jaPublicado: true,
      respostaPendente: null,
      pecasBaixadas: [],
      totalBaixado: 0,
      exigeDecisaoEstoque: false,
    });
    mockAtualizarServicosVerificacao.mockResolvedValue({
      ...makeVerificacao(),
      portal: { acao: "NOVA_APROVACAO_PUBLICADA", versao: 2, mensagem: "Nova aprovação pedida: a versão 2 foi publicada no portal para o cliente responder." },
    });
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId("action-alterar_orcamento"));
    });
    await waitFor(() => expect(screen.getByText(/O status atual do equipamento será mantido/i)).toBeInTheDocument());

    await alterarValorOrcamento(250);
    await clicarConfirmarStatus();
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-cancel"));
    });

    await waitFor(() => expect(screen.getByText("Este orçamento já foi aprovado")).toBeInTheDocument());
    expect(mockAtualizarServicosVerificacao).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/Pedir nova aprovação ao cliente/));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar alteração" }));
    });

    await waitFor(() => expect(mockAtualizarServicosVerificacao).toHaveBeenCalledTimes(1));
    const [input] = mockAtualizarServicosVerificacao.mock.calls[0];
    expect(input.opcoes).toEqual({ modoAprovado: "NOVA_APROVACAO", devolverEstoque: false });
    expect(input.cliente_aprovou_alteracao).toBe(false);
    expect(input.forma_pagamento_codigo).toBeUndefined();
  });

  it("mantém Aprovar e Reprovar visíveis e move Alterar Orçamento para o menu", async () => {
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    render(<Equipamentos />);

    expect(screen.getByTestId("action-aprovar")).toHaveTextContent("Aprovar");
    expect(screen.getByTestId("action-reprovar")).toHaveTextContent("Reprovar");
    expect(screen.getByTestId("action-orcamento_pdf")).toHaveTextContent("Orçamento PDF");
    expect(screen.getByTestId("action-alterar_orcamento")).toHaveTextContent("Alterar Orçamento");
    expect(screen.getByTestId("action-editar")).toHaveTextContent("Editar Equipamento");
  });

  it("aprova somente depois de escolher pagamento e usa a operação transacional", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    render(<Equipamentos />);

    fireEvent.click(screen.getByTestId("action-aprovar"));
    await waitFor(() => expect(screen.getByText("Todos os serviços de troca foram aprovados?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Sim, todos" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar para pagamento" }));
    await waitFor(() => expect(screen.getByText(/Forma de pagamento da aprovação/i)).toBeInTheDocument());
    expect(mockAtualizarStatusEquipamento).not.toHaveBeenCalledWith(10, "APROVADO", expect.anything(), expect.anything(), expect.anything(), expect.anything(), expect.anything());

    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));
    await waitFor(() => expect(mockAprovarOrcamento).toHaveBeenCalledWith(expect.objectContaining({
      empresa_id: 7,
      equipamento_id: 10,
      pagamento: { codigo: "PIX", detalhe: null },
    })));
  });

  it("usa a soma dos serviços quando o total legado é zero", async () => {
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    equipamentoVerificado.valor_orcamento = 80;
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({
      servicos: [{ id: "s1", descricao: "Troca de fonte", valor: 80, pecas: [] }],
      pecas: [],
      custo_total: 0,
    }));
    render(<Equipamentos />);

    fireEvent.click(screen.getByTestId("action-aprovar"));
    await waitFor(() => expect(screen.getByText("Todos os serviços de troca foram aprovados?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Sim, todos" }));

    expect(screen.getByText(/Total aprovado:/)).toHaveTextContent("R$ 80,00");
  });

  it("aprova orçamento antigo sem serviços detalhados sem convertê-lo em reprovação", async () => {
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({ servicos: [], pecas: [], custo_total: 0 }));
    render(<Equipamentos />);

    fireEvent.click(screen.getByTestId("action-aprovar"));
    await screen.findByText(/orçamento antigo não possui serviços detalhados/i);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar orçamento" }));
    expect(screen.getByText(/Valor do orçamento:/)).toHaveTextContent("R$ 150,00");
    expect(screen.getByRole("button", { name: "Continuar para pagamento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar para pagamento" }));
    fireEvent.change(await screen.findByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));

    await waitFor(() => expect(mockAprovarOrcamento).toHaveBeenCalledWith(expect.objectContaining({
      aprovado: true,
      servicos_aprovados: [],
      pagamento: { codigo: "PIX", detalhe: null },
    })));
  });

  it("mostra o valor do equipamento quando o total antigo está ausente", async () => {
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    mockBuscarVerificacao.mockResolvedValue({ ...makeVerificacao({ servicos: [], pecas: [] }), custo_total: null });
    render(<Equipamentos />);

    fireEvent.click(screen.getByTestId("action-aprovar"));
    await screen.findByText(/orçamento antigo não possui serviços detalhados/i);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar orçamento" }));
    expect(screen.getByText(/Valor do orçamento:/)).toHaveTextContent("R$ 150,00");
  });

  it("permite cancelar a aprovação e mantém o modal após erro do backend", async () => {
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    mockAprovarOrcamento.mockRejectedValue(new Error("Falha de concorrência"));
    render(<Equipamentos />);

    fireEvent.click(screen.getByTestId("action-aprovar"));
    await waitFor(() => expect(screen.getByText("Todos os serviços de troca foram aprovados?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Sim, todos" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar para pagamento" }));
    await waitFor(() => expect(screen.getByText(/Forma de pagamento da aprovação/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(mockAprovarOrcamento).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("action-aprovar"));
    await waitFor(() => expect(screen.getByText("Todos os serviços de troca foram aprovados?")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Sim, todos" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar para pagamento" }));
    await waitFor(() => expect(screen.getByText(/Forma de pagamento da aprovação/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Falha de concorrência/i));
    expect(screen.getByText(/Forma de pagamento da aprovação/i)).toBeInTheDocument();
  });

  it("envia somente serviços selecionados na aprovação parcial", async () => {
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({ pecas: [], servicos: [
      { id: "cabeca", descricao: "Troca da cabeça", valor: 100, pecas: [{ produto_id: 1, nome: "Cabeça", quantidade: 1, valor_unitario: 80 }] },
      { id: "feed", descricao: "Troca do feed", valor: 30 },
    ] }));
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-aprovar"));
    await screen.findByText("Todos os serviços de troca foram aprovados?");
    fireEvent.click(screen.getByRole("button", { name: "Não, selecionar" }));
    fireEvent.click(screen.getByLabelText(/Troca da cabeça/));
    expect(screen.getByText(/Cabeça: 1 necessária/)).toHaveTextContent("pendência");
    expect(mockAprovarOrcamento).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Continuar para pagamento" }));
    fireEvent.change(await screen.findByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));
    await waitFor(() => expect(mockAprovarOrcamento).toHaveBeenCalledWith(expect.objectContaining({ servicos_aprovados: ["cabeca"] })));
  });

  it("reprova sem serviços selecionados e exibe falha sem fechar o modal", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    mockAprovarOrcamento.mockRejectedValue(new Error("Orçamento desatualizado"));
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-reprovar"));
    await screen.findByText("Todos os serviços de troca foram aprovados?");
    fireEvent.click(screen.getByRole("button", { name: "Não, selecionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reprovação" }));
    await waitFor(() => expect(mockAprovarOrcamento).toHaveBeenCalledWith(expect.objectContaining({ aprovado: false, servicos_aprovados: [] })));
    expect(await screen.findByRole("alert")).toHaveTextContent("Orçamento desatualizado");
  });

  it("imprimir o Orçamento PDF sem baixar publica o PDF oficial no portal", async () => {
    const artifact = { filename: "orc.pdf", bytes: new Uint8Array([37]), mimeType: "application/pdf" };
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    mockPdfService.construirOrcamentoAjustado.mockResolvedValue(artifact);
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-orcamento_pdf"));
    await waitFor(() => expect(pdfPreviewProps.current?.artifact).toBe(artifact));
    expect(pdfPreviewProps.current?.onBeforePrint).toBeTypeOf("function");
    await pdfPreviewProps.current!.onBeforePrint!(artifact);
    expect(mockPublicarPdfOficial).toHaveBeenCalledTimes(1);
    expect(mockPublicarPdfOficial).toHaveBeenCalledWith(artifact, expect.objectContaining({ id: equipamentoVerificado.id }));
  });

  it("total confirmado diferente da soma dos itens: Orçamento PDF abre, imprime/publica e baixa com o total gravado", async () => {
    // Itens somam R$ 150,00; o operador confirmou R$ 120,00 (“Não grava o valor digitado”).
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const real = await vi.importActual<typeof import("@/lib/pdf-service")>("@/lib/pdf-service");
    const portal = { tipo: "ORCAMENTO_AJUSTADO", versaoId: 3, atualizadoEm: equipamentoVerificado.atualizado_em };
    mockReferenciaPdfPortal.mockResolvedValue(portal);
    mockListarImagensEquipamento.mockResolvedValue([]);
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({
      adjusted_at: "2024-06-20T14:30:00Z",
      pecas: [{ id: "p1", nome: "Fonte 24V", quantidade: 1, valorUnitario: 50, valorTotal: 50 }],
      custo_total: 120,
    }));
    mockPdfService.construirOrcamentoAjustado.mockImplementation(
      (...args: Parameters<typeof real.PdfService.construirOrcamentoAjustado>) => real.PdfService.construirOrcamentoAjustado(...args),
    );
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-orcamento_pdf"));
    await waitFor(() => expect(pdfPreviewProps.current?.artifact).toBeTruthy(), { timeout: 5000 });
    const artifact = pdfPreviewProps.current!.artifact as { bytes: Uint8Array; portal: unknown };
    expect(alertSpy).not.toHaveBeenCalled();
    expect(artifact.portal).toEqual(portal);
    const texto = new TextDecoder("latin1").decode(artifact.bytes);
    expect(texto).toContain("120,00");
    expect(texto).not.toContain("150,00");

    await pdfPreviewProps.current!.onBeforePrint!(artifact);
    expect(mockPublicarPdfOficial).toHaveBeenCalledWith(artifact, expect.objectContaining({ id: equipamentoVerificado.id }));
    await pdfPreviewProps.current!.onDownload!(artifact);
    expect(mockPdfService.salvarOrcamento).toHaveBeenCalledWith(artifact, expect.objectContaining({ id: equipamentoVerificado.id }));
    alertSpy.mockRestore();
  }, 15000);

  it("imprimir a OS PDF sem baixar publica o PDF oficial no portal", async () => {
    equipamentoVerificado.status = "RECEBIDO";
    const artifact = { filename: "os.pdf", bytes: new Uint8Array([37]), mimeType: "application/pdf" };
    mockPdfService.construirOrdemServico.mockResolvedValue(artifact);
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-os_pdf"));
    await waitFor(() => expect(pdfPreviewProps.current?.artifact).toBe(artifact));
    await pdfPreviewProps.current!.onBeforePrint!(artifact);
    expect(mockPublicarPdfOficial).toHaveBeenCalledWith(artifact, expect.objectContaining({ id: equipamentoVerificado.id }));
  });

  it("reenvia o orçamento por e-mail após confirmar sem alterar o status", async () => {
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    const verif = makeVerificacao();
    mockBuscarVerificacao.mockResolvedValueOnce(verif);
    mockBuscarEquipamento
      .mockResolvedValueOnce(equipamentoVerificado)
      .mockResolvedValueOnce(equipamentoVerificado);
    mockEnviarOrcamentoEmail.mockResolvedValueOnce({ sucesso: true });

    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-reenviar_orcamento_email"));
    const confirmar = await screen.findByRole("button", { name: "Reenviar e-mail" });
    expect(screen.getByText(/Enviar o orçamento da OS #10 para Cliente A/)).toBeInTheDocument();
    expect(mockEnviarOrcamentoEmail).not.toHaveBeenCalled();
    fireEvent.click(confirmar);

    await waitFor(() => expect(mockEnviarOrcamentoEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: 10, cliente_email: "a@ex.com" }), verif,
    ));
    expect(mockAtualizarStatusEquipamento).not.toHaveBeenCalled();
    expect(mockAprovarOrcamento).not.toHaveBeenCalled();
  });

  it("cancela o reenvio se a OS deixa de aguardar aprovação durante a confirmação", async () => {
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    mockBuscarEquipamento
      .mockResolvedValueOnce(equipamentoVerificado)
      .mockResolvedValueOnce({ ...equipamentoVerificado, status: "APROVADO" });
    mockBuscarVerificacao.mockResolvedValueOnce(makeVerificacao());

    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-reenviar_orcamento_email"));
    const confirmar = await screen.findByRole("button", { name: "Reenviar e-mail" });
    await act(async () => fireEvent.click(confirmar));

    expect(mockBuscarEquipamento).toHaveBeenCalledTimes(2);
    expect(mockEnviarOrcamentoEmail).not.toHaveBeenCalled();
  });

  it("oferece Orçamento PDF e Alterar Orçamento no menu em todas as fases após a verificação", () => {
    const fases = [
      "VERIFICADO",
      "AGUARDANDO_APROVACAO",
      "APROVADO",
      "REPROVADO",
      "EM_MANUTENCAO",
      "AGUARDANDO_PECA",
      "PRONTO",
      "ENTREGUE",
      "ORCAMENTO_VENCIDO",
      "ABANDONADO",
    ];

    for (const fase of fases) {
      equipamentoVerificado.status = fase;
      const view = render(<Equipamentos />);
      expect(screen.getByTestId("action-orcamento_pdf")).toHaveTextContent("Orçamento PDF");
      expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument();
      view.unmount();
    }

    equipamentoVerificado.status = "EM_VERIFICACAO";
    const view = render(<Equipamentos />);
    expect(screen.queryByTestId("action-orcamento_pdf")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-alterar_orcamento")).not.toBeInTheDocument();
    view.unmount();
  });

  it("a linha permanece linha e o controle dedicado abre o detalhe", async () => {
    const user = userEvent.setup();
    const view = render(<Equipamentos />);
    const opener = screen.getByRole("button", { name: "Abrir detalhes de Zebra ZT230" });
    expect(opener.tagName).toBe("BUTTON");
    expect(opener).toHaveClass("equipment-row-open");
    const row = opener.closest("tr");
    expect(row).not.toBeNull();
    expect(row).not.toHaveAttribute("role");
    expect(row).not.toHaveAttribute("tabindex");
    expect(opener.contains(screen.getByTestId("action-enviar_orcamento"))).toBe(false);
    const cells = row!.querySelectorAll("td");
    expect(cells[0].className).toContain("group-has-[.equipment-row-open:focus-visible]:after:border-l-[3px]");
    expect(cells[0].className).toContain("after:border-ring");
    expect(cells[0].className).toContain("focus-visible");
    expect(cells[0].classList.contains("relative")).toBe(true);
    expect(cells[1].className).toContain("after:border-y-[3px]");
    expect(cells[1].className).not.toContain("after:border-l-[3px]");
    expect(cells[cells.length - 1].className).toContain("after:border-r-[3px]");
    expect(cells[cells.length - 1].className).toContain("after:inset-0");
    expect(cells[cells.length - 1].classList.contains("relative")).toBe(false);

    fireEvent.click(screen.getByText("SN001"));
    expect(await screen.findByText("Detalhes do Equipamento")).toBeInTheDocument();
    view.unmount();

    const enterView = render(<Equipamentos />);
    const enterOpener = screen.getByRole("button", { name: "Abrir detalhes de Zebra ZT230" });
    enterOpener.focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Detalhes do Equipamento")).toBeInTheDocument();
    enterView.unmount();

    const spaceView = render(<Equipamentos />);
    const spaceOpener = screen.getByRole("button", { name: "Abrir detalhes de Zebra ZT230" });
    spaceOpener.focus();
    await user.keyboard(" ");
    expect(await screen.findByText("Detalhes do Equipamento")).toBeInTheDocument();
    spaceView.unmount();
  });

  it("Enter em Marcar Pronto não abre o detalhe", async () => {
    const user = userEvent.setup();
    equipamentoVerificado.status = "EM_MANUTENCAO";
    render(<Equipamentos />);
    const pronto = screen.getByRole("button", { name: "Marcar Pronto" });
    expect(screen.getByRole("button", { name: "Abrir detalhes de Zebra ZT230" }).contains(pronto)).toBe(false);
    pronto.focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Detalhes do Equipamento")).not.toBeInTheDocument();
  });

  it("Enter e Espaço nos botões de Ações não abrem o detalhe pela linha", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    render(<Equipamentos />);
    const action = screen.getByTestId("action-enviar_orcamento");

    fireEvent.keyDown(action, { key: "Enter" });
    fireEvent.keyDown(action, { key: " " });
    expect(screen.queryByText("Detalhes do Equipamento")).not.toBeInTheDocument();

    fireEvent.click(action);
    expect(await screen.findByText(/Ajuste de Orçamento/i)).toBeInTheDocument();
    expect(screen.queryByText("Detalhes do Equipamento")).not.toBeInTheDocument();
  });

  it("salva edição textual sem substituir fotos inalteradas mesmo com aviso de arquivo inválido", async () => {
    mockListarImagensEquipamento.mockResolvedValue([{
      id: 77,
      equipamento_id: 10,
      categoria: "ENTRADA",
      filename: "entrada.jpg",
      mime_type: "image/jpeg",
      tamanho_bytes: 123,
      largura: 800,
      altura: 600,
      ordem: 0,
      observacao: "frente",
      storage_path: "data:image/jpeg;base64,conteudo",
    }]);
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-editar"));
    await screen.findByText("entrada.jpg");
    const arquivoInvalido = new File(["conteudo"], "anotacao.pdf", { type: "application/pdf" });
    fireEvent.change(document.getElementById("equipamento-imagens-entrada")!, {
      target: { files: [arquivoInvalido] },
    });
    await screen.findByText(/Erros no processamento/);
    await waitFor(() => expect(screen.queryByRole("status", { name: "Carregando fotos" })).not.toBeInTheDocument());
    fireEvent.change(screen.getByPlaceholderText("ZD421, GC420T"), { target: { value: "ZT230 revisada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mockAtualizarEquipamento).toHaveBeenCalledOnce());
    expect(mockSubstituirImagensEquipamento).not.toHaveBeenCalled();
  });

  it("não grava o equipamento após falha ao carregar fotos e permite recarregá-las sem perder texto", async () => {
    mockListarImagensEquipamento.mockRejectedValueOnce(new Error("offline"));
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-editar"));
    fireEvent.change(screen.getByPlaceholderText("ZD421, GC420T"), { target: { value: "texto preservado" } });
    await screen.findByRole("button", { name: "Recarregar fotos" });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mockAtualizarEquipamento).not.toHaveBeenCalled();

    mockListarImagensEquipamento.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: "Recarregar fotos" }));
    await screen.findByRole("status", { name: "Carregando fotos" });
    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "Carregando fotos" })).not.toBeInTheDocument();
      expect(screen.getByPlaceholderText("ZD421, GC420T")).toHaveValue("texto preservado");
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mockAtualizarEquipamento).toHaveBeenCalledOnce());
    expect(mockSubstituirImagensEquipamento).not.toHaveBeenCalled();
  });

  it("envia IDs do snapshot ao alterar fotos e mantém o diálogo após conflito CAS", async () => {
    mockListarImagensEquipamento.mockResolvedValue([{
      id: 77,
      equipamento_id: 10,
      categoria: "ENTRADA",
      filename: "entrada.jpg",
      mime_type: "image/jpeg",
      tamanho_bytes: 123,
      largura: 800,
      altura: 600,
      ordem: 0,
      storage_path: "data:image/jpeg;base64,conteudo",
    }]);
    mockSubstituirImagensEquipamento.mockRejectedValueOnce(new Error("Conflito de concorrência nas fotos"));
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-editar"));
    await screen.findByText("entrada.jpg");
    fireEvent.change(screen.getByPlaceholderText("ZD421, GC420T"), { target: { value: "texto mantido no conflito" } });
    fireEvent.click(screen.getByRole("button", { name: "Remover entrada.jpg" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(mockSubstituirImagensEquipamento).toHaveBeenCalledOnce());
    expect(mockSubstituirImagensEquipamento).toHaveBeenCalledWith(10, [], [77]);
    expect(screen.getByRole("heading", { name: "Editar equipamento" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("ZD421, GC420T")).toHaveValue("texto mantido no conflito");

    mockListarImagensEquipamento.mockResolvedValueOnce([{
      id: 99,
      equipamento_id: 10,
      categoria: "ENTRADA",
      filename: "foto-atualizada-externamente.jpg",
      mime_type: "image/jpeg",
      tamanho_bytes: 100,
      ordem: 0,
      storage_path: "data:image/jpeg;base64,externa",
    }]);
    fireEvent.click(screen.getByRole("button", { name: "Recarregar fotos" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Recarregar fotos" })).not.toBeInTheDocument());
    expect(screen.getByPlaceholderText("ZD421, GC420T")).toHaveValue("texto mantido no conflito");
    expect(screen.getByText("foto-atualizada-externamente.jpg")).toBeInTheDocument();
  });

  it("não fecha um formulário novo quando uma gravação anterior termina", async () => {
    let concluirGravacao!: (value: any) => void;
    mockAtualizarEquipamento.mockReturnValueOnce(new Promise((resolve) => { concluirGravacao = resolve; }));
    mockListarImagensEquipamento.mockResolvedValue([]);
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-editar"));
    await screen.findByRole("heading", { name: "Editar equipamento" });
    fireEvent.change(screen.getByPlaceholderText("ZD421, GC420T"), { target: { value: "gravação antiga" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mockAtualizarEquipamento).toHaveBeenCalledOnce());

    // A gravação ainda não terminou: a seta pergunta antes de descartar a edição.
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sair sem salvar" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Editar equipamento" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-editar"));
    await screen.findByRole("heading", { name: "Editar equipamento" });

    await act(async () => {
      concluirGravacao({
        sucesso: true,
        data: { ...equipamentoVerificado, modelo: "gravação antiga", atualizado_em: "2024-01-15T10:00:02Z" },
      });
    });

    expect(screen.getByPlaceholderText("ZD421, GC420T")).toHaveValue("ZT230");
    expect(screen.getByRole("heading", { name: "Editar equipamento" })).toBeInTheDocument();
  });

  it("Nova entrada e Editar abrem como página, com rota própria", async () => {
    mockListarImagensEquipamento.mockResolvedValue([]);
    render(<Equipamentos />);
    fireEvent.click(screen.getByRole("button", { name: "Nova entrada" }));
    await screen.findByRole("heading", { name: "Nova entrada" });
    expect(mockNavigate).toHaveBeenCalledWith("/equipamentos/nova");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Nova entrada" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId("action-editar"));
    await screen.findByRole("heading", { name: "Editar equipamento" });
    expect(mockNavigate).toHaveBeenCalledWith(`/equipamentos/${equipamentoVerificado.id}/editar`);
  });

  it("ignora uma foto de celular convertida depois que o formulário original foi fechado", async () => {
    let concluirConversao!: (dataUrl: string) => void;
    const conversao = new Promise<string>((resolve) => { concluirConversao = resolve; });
    vi.spyOn(equipamentoImagemUtils, "bytesParaDataUrl").mockReturnValue(conversao);
    mockListarImagensEquipamento.mockResolvedValue([]);
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-editar"));
    await screen.findByRole("button", { name: /Via Celular/ });
    fireEvent.click(screen.getByRole("button", { name: /Via Celular/ }));
    fireEvent.click(await screen.findByTestId("emitir-foto-celular"));
    expect(equipamentoImagemUtils.bytesParaDataUrl).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Editar equipamento" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Nova entrada" }));
    await screen.findByRole("heading", { name: "Nova entrada" });

    await act(async () => {
      concluirConversao("data:image/jpeg;base64,camera");
      await conversao;
    });
    expect(screen.queryByText("foto-celular.jpg")).not.toBeInTheDocument();
  });

  it("ignora fotos de uma edição anterior que terminam após a edição atual", async () => {
    const equipamentoMaisNovo = { ...equipamentoVerificado, id: 11, serial_number: "SN002", cliente_nome: "Cliente B" };
    mockEquipamentos.push(equipamentoMaisNovo);
    let concluirAntigo!: (value: any[]) => void;
    mockListarImagensEquipamento.mockImplementation((id: number) => {
      if (id === 10) return new Promise((resolve) => { concluirAntigo = resolve; });
      return Promise.resolve([{
        id: 88,
        equipamento_id: 11,
        categoria: "ENTRADA",
        filename: "foto-nova.jpg",
        mime_type: "image/jpeg",
        tamanho_bytes: 100,
        ordem: 0,
        storage_path: "data:image/jpeg;base64,nova",
      }]);
    });
    try {
      render(<Equipamentos />);
      const editButtons = screen.getAllByTestId("action-editar");
      fireEvent.click(editButtons[0]);
      fireEvent.click(editButtons[1]);
      await screen.findByText("foto-nova.jpg");
      await act(async () => {
        concluirAntigo([{
          id: 77,
          equipamento_id: 10,
          categoria: "ENTRADA",
          filename: "foto-antiga.jpg",
          mime_type: "image/jpeg",
          tamanho_bytes: 100,
          ordem: 0,
          storage_path: "data:image/jpeg;base64,antiga",
        }]);
      });
      expect(screen.queryByText("foto-antiga.jpg")).not.toBeInTheDocument();
      expect(screen.getByText("foto-nova.jpg")).toBeInTheDocument();
    } finally {
      mockEquipamentos.splice(mockEquipamentos.indexOf(equipamentoMaisNovo), 1);
    }
  });

  it("não envia orçamento com total 0,00 para AGUARDANDO_APROVACAO", async () => {
    equipamentoVerificado.valor_orcamento = 0;
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({ servicos: [], pecas: [], custo_total: 0 }));
    await abrirDialogoAjusteOrcamento();
    await alterarValorOrcamento(0);
    expect(screen.getByRole("button", { name: /Confirmar/i })).toBeDisabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Confirmar/i }));
    });
    expect(mockAtualizarServicosVerificacao).not.toHaveBeenCalled();
    expect(mockAtualizarStatusEquipamento).not.toHaveBeenCalled();
  });

  it("Não na divergência não grava total 0 ao enviar para aprovação", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();
    await alterarValorOrcamento(0);
    expect(screen.getByRole("button", { name: /Confirmar/i })).toBeDisabled();
    await clicarConfirmarStatus();
    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
    expect(mockAtualizarServicosVerificacao).not.toHaveBeenCalled();
  });

  it("bloqueia Confirmar quando o valor do orçamento obrigatório fica vazio", async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();
    const input = screen.getByTestId("valor-orcamento-input");
    await act(async () => {
      fireEvent.change(input, { target: { value: "" } });
    });
    const confirmar = screen.getByRole("button", { name: /Confirmar/i });
    expect(confirmar).toBeDisabled();
    await act(async () => {
      fireEvent.click(confirmar);
    });
    expect(mockAtualizarServicosVerificacao).not.toHaveBeenCalled();
  });

  it("esconde Aprovar e Reprovar sem a permissão Orçamentos e valores", async () => {
    mockPermissions.list = [];
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-status")).toBeInTheDocument());
    expect(screen.queryByTestId("action-aprovar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-reprovar")).not.toBeInTheDocument();
  });

  it("esconde Alterar Orçamento, Enviar Orçamento e Excluir sem as permissões correspondentes", async () => {
    mockPermissions.list = [];
    equipamentoVerificado.status = "VERIFICADO";
    const view = render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-status")).toBeInTheDocument());
    expect(screen.queryByTestId("action-enviar_orcamento")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-alterar_orcamento")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-excluir")).not.toBeInTheDocument();
    view.unmount();

    mockPermissions.list = ["PREPARE_QUOTES"];
    const prepareView = render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-enviar_orcamento")).toBeInTheDocument());
    expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument();
    expect(screen.queryByTestId("action-excluir")).not.toBeInTheDocument();
    prepareView.unmount();

    mockPermissions.list = ["DELETE_RECORDS"];
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-excluir")).toBeInTheDocument());
    expect(screen.queryByTestId("action-enviar_orcamento")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-alterar_orcamento")).not.toBeInTheDocument();
  });

  it("PREPARE_QUOTES mostra Aprovar e Reprovar sem financeiro", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
    expect(screen.getByTestId("action-aprovar")).toBeInTheDocument();
    expect(screen.getByTestId("action-reprovar")).toBeInTheDocument();
  });

  it("PREPARE_QUOTES não mostra Alterar Orçamento em APROVADO", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    equipamentoVerificado.status = "APROVADO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-iniciar_manutencao")).toBeInTheDocument());
    expect(screen.queryByTestId("action-alterar_orcamento")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-corrigir_decisao")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-desfazer_aprovacao")).not.toBeInTheDocument();
  });

  it("REPROVADO com financeiro tem Reabrir e não tem Corrigir decisão nem Corrigir status", async () => {
    equipamentoVerificado.status = "REPROVADO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-reabrir_orcamento")).toBeInTheDocument());
    expect(screen.queryByTestId("action-corrigir_decisao")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-corrigir_status")).not.toBeInTheDocument();
  });

  it("REPROVADO: Foi um engano abre a correção da decisão", async () => {
    equipamentoVerificado.status = "REPROVADO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-reabrir_orcamento")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-reabrir_orcamento"));
    fireEvent.click(await screen.findByRole("button", { name: /Foi um engano/i }));
    await waitFor(() => expect(mockEnsureSensitiveAccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Corrigir decisão do orçamento" }),
    ));
  });

  it("REPROVADO: Nova proposta abre o Mudar Status com Aguardando Aprovação pré-selecionado", async () => {
    equipamentoVerificado.status = "REPROVADO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-reabrir_orcamento")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-reabrir_orcamento"));
    fireEvent.click(await screen.findByRole("button", { name: /Nova proposta/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Novo:").parentElement).toHaveTextContent("AGUARDANDO_APROVACAO");
  });

  it("REPROVADO: Mudar Status sem pré-seleção não lista Aguardando Aprovação", async () => {
    equipamentoVerificado.status = "REPROVADO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-mudar_status")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-mudar_status"));
    const dialog = await screen.findByRole("dialog");
    // jsdom não implementa estes métodos que o Radix Select chama ao abrir.
    Object.assign(Element.prototype, {
      hasPointerCapture: () => false,
      releasePointerCapture: () => undefined,
      scrollIntoView: () => undefined,
    });
    fireEvent.pointerDown(within(dialog).getByRole("combobox"), { button: 0, ctrlKey: false, pointerType: "mouse" });
    const opcoes = await screen.findAllByRole("option");
    const textos = opcoes.map((opcao) => opcao.textContent);
    expect(textos).not.toContain("Aguardando Aprovação");
    expect(textos.length).toBeGreaterThan(0);
  });

  it("APROVADO tem Desfazer aprovação e não tem Corrigir status", async () => {
    equipamentoVerificado.status = "APROVADO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-desfazer_aprovacao")).toBeInTheDocument());
    expect(screen.queryByTestId("action-corrigir_decisao")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-corrigir_status")).not.toBeInTheDocument();
  });

  it("ORCAMENTO_VENCIDO tem Renovar orçamento e não tem Reenviar", async () => {
    equipamentoVerificado.status = "ORCAMENTO_VENCIDO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-renovar_orcamento")).toBeInTheDocument());
    expect(screen.queryByTestId("action-reenviar_orcamento")).not.toBeInTheDocument();
  });

  it("Técnico com Orçamentos, sem financeiro, vê Nova proposta mas não Corrigir decisão", async () => {
    mockPermissions.list = ["STOCK_CONTROL", "PREPARE_QUOTES", "MANAGE_STATUS_LINKS"];
    equipamentoVerificado.status = "REPROVADO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-reabrir_orcamento")).toBeInTheDocument());
    expect(screen.queryByTestId("action-corrigir_decisao")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-corrigir_status")).not.toBeInTheDocument();
  });

  it("Perfil sem Orçamentos nem financeiro não vê Reabrir, Renovar nem Corrigir decisão", async () => {
    mockPermissions.list = [];
    equipamentoVerificado.status = "REPROVADO";
    const reprovado = render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-status")).toBeInTheDocument());
    expect(screen.queryByTestId("action-reabrir_orcamento")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-corrigir_decisao")).not.toBeInTheDocument();
    reprovado.unmount();

    equipamentoVerificado.status = "ORCAMENTO_VENCIDO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-status")).toBeInTheDocument());
    expect(screen.queryByTestId("action-renovar_orcamento")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-reenviar_orcamento")).not.toBeInTheDocument();
  });

  it("em AGUARDANDO_APROVACAO, Confirmar fica desabilitado com 0,00 mesmo só de garantia", async () => {
    mockPermissions.list = ["FINANCIAL_ACTIONS"];
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    equipamentoVerificado.valor_orcamento = 80;
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({
      servicos: [{ id: "g1", descricao: "Garantia", valor: 0 }],
      pecas: [],
      custo_total: 0,
    }));
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-alterar_orcamento"));
    await waitFor(() => expect(screen.getByText(/O status atual do equipamento será mantido/i)).toBeInTheDocument());
    await alterarValorOrcamento(0);
    expect(screen.getByText(/não pode ficar com R\$ 0,00/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar/i })).toBeDisabled();
    mockEnsureSensitiveAccess.mockClear();
    await clicarConfirmarStatus();
    expect(mockAtualizarServicosVerificacao).not.toHaveBeenCalled();
  });

  it("em APROVADO, Confirmar fica desabilitado com 0,00 se houver item cobrado e não grava", async () => {
    equipamentoVerificado.status = "APROVADO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-alterar_orcamento"));
    await waitFor(() => expect(screen.getByText(/O status atual do equipamento será mantido/i)).toBeInTheDocument());
    await alterarValorOrcamento(0);
    expect(screen.getByText(/Não é possível zerar um orçamento já aprovado e pago/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar/i })).toBeDisabled();
    mockEnsureSensitiveAccess.mockClear();
    await clicarConfirmarStatus();
    expect(mockAtualizarServicosVerificacao).not.toHaveBeenCalled();
    expect(mockEnsureSensitiveAccess).not.toHaveBeenCalled();
  });

  it("em VERIFICADO, ajuste só de garantia pede confirmação antes do PIN e cancelar não grava", async () => {
    mockPermissions.list = ["FINANCIAL_ACTIONS"];
    equipamentoVerificado.status = "VERIFICADO";
    equipamentoVerificado.valor_orcamento = 0;
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({
      servicos: [{ id: "g1", descricao: "Garantia", valor: 0 }],
      pecas: [],
      custo_total: 0,
    }));
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-alterar_orcamento"));
    await waitFor(() => expect(screen.getByText(/O status atual do equipamento será mantido/i)).toBeInTheDocument());
    await alterarValorOrcamento(0);
    mockEnsureSensitiveAccess.mockClear();
    await clicarConfirmarStatus();
    await waitFor(() => expect(screen.getByTestId("confirm-title")).toHaveTextContent("Confirmar OS só de garantia?"));
    fireEvent.click(screen.getByTestId("confirm-cancel"));
    expect(mockAtualizarServicosVerificacao).not.toHaveBeenCalled();
    expect(mockEnsureSensitiveAccess).not.toHaveBeenCalled();
  });

  it("em VERIFICADO, confirmar garantia grava com confirmarGarantia e pede PIN de aprovador", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    equipamentoVerificado.status = "VERIFICADO";
    equipamentoVerificado.valor_orcamento = 0;
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({
      servicos: [{ id: "g1", descricao: "Garantia", valor: 0 }],
      pecas: [],
      custo_total: 0,
    }));
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-alterar_orcamento"));
    await waitFor(() => expect(screen.getByText(/O status atual do equipamento será mantido/i)).toBeInTheDocument());
    await alterarValorOrcamento(0);
    mockEnsureSensitiveAccess.mockClear();
    await clicarConfirmarStatus();
    await waitFor(() => expect(screen.getByTestId("confirm-action")).toHaveTextContent("Confirmar garantia"));
    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(mockEnsureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({
      anyPermission: ["FINANCIAL_ACTIONS", "PREPARE_QUOTES"],
    })));
    await waitFor(() => expect(mockAtualizarServicosVerificacao).toHaveBeenCalled());
    const input = mockAtualizarServicosVerificacao.mock.calls[0][0];
    expect(input.opcoes.confirmarGarantia).toBe(true);
  });

  it("ajuste de OS só de garantia com 0,00 habilita Confirmar e exige PIN", async () => {
    equipamentoVerificado.status = "APROVADO";
    equipamentoVerificado.valor_orcamento = 0;
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao({
      servicos: [{ id: "g1", descricao: "Garantia", valor: 0 }],
      pecas: [],
      custo_total: 0,
    }));
    mockAnalisarAjusteOrcamento.mockResolvedValue({
      status: "APROVADO",
      podePedirNovaAprovacao: true,
      jaPublicado: false,
      respostaPendente: null,
      pecasBaixadas: [],
      totalBaixado: 0,
      exigeDecisaoEstoque: false,
    });
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("action-alterar_orcamento"));
    await waitFor(() => expect(screen.getByText(/O status atual do equipamento será mantido/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    expect(screen.getByRole("button", { name: /Confirmar/i })).toBeEnabled();
    mockEnsureSensitiveAccess.mockClear();
    await clicarConfirmarStatus();
    await waitFor(() => expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
    });
    await waitFor(() => expect(mockEnsureSensitiveAccess).toHaveBeenCalled());
  });

  it("entrega envia os IDs atuais como snapshot ao substituir fotos", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    equipamentoVerificado.prazo_aprovacao = "2027-01-20";
    mockEnsureSensitiveAccess.mockImplementation(async ({ permission }) => !permission);
    equipamentoVerificado.status = "PRONTO";
    mockListarImagensEquipamento.mockResolvedValue([{
      id: 77,
      equipamento_id: 10,
      categoria: "ENTRADA",
      filename: "entrada.jpg",
      mime_type: "image/jpeg",
      tamanho_bytes: 123,
      largura: 800,
      altura: 600,
      ordem: 0,
      storage_path: "data:image/jpeg;base64,conteudo",
    }]);
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-registrar_entrega"));
    await screen.findByText(/Foto da saída \(entrega\)/);
    await clicarConfirmarStatus();
    await waitFor(() => expect(mockSubstituirImagensEquipamento).toHaveBeenCalled());
    expect(mockSubstituirImagensEquipamento).toHaveBeenCalledWith(
      10,
      expect.arrayContaining([expect.objectContaining({ filename: "entrada.jpg", categoria: "ENTRADA" })]),
      [77],
    );
    await waitFor(() => expect(mockAtualizarStatusEquipamento).toHaveBeenCalledWith(
      10, "ENTREGUE", undefined, undefined, undefined, expect.any(String), undefined,
    ));
    expect(mockEnsureSensitiveAccess.mock.calls.every(([options]) => !options.permission && !options.anyPermission)).toBe(true);
  });

  it("conflito de fotos na entrega não marca Entregue e mantém o diálogo", async () => {
    equipamentoVerificado.status = "PRONTO";
    mockListarImagensEquipamento.mockResolvedValue([{
      id: 77,
      equipamento_id: 10,
      categoria: "ENTRADA",
      filename: "entrada.jpg",
      mime_type: "image/jpeg",
      tamanho_bytes: 123,
      ordem: 0,
      storage_path: "data:image/jpeg;base64,conteudo",
    }]);
    mockSubstituirImagensEquipamento.mockRejectedValueOnce(
      new Error("Conflito de concorrência: as fotos do equipamento foram alteradas. Recarregue as fotos antes de salvar novamente."),
    );
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-registrar_entrega"));
    await screen.findByText(/Foto da saída \(entrega\)/);
    await clicarConfirmarStatus();
    await waitFor(() => expect(mockSubstituirImagensEquipamento).toHaveBeenCalledWith(10, expect.any(Array), [77]));
    expect(mockAtualizarStatusEquipamento).not.toHaveBeenCalled();
    expect(screen.getByText(/Foto da saída \(entrega\)/)).toBeInTheDocument();
    expect(screen.getByText(/Conflito de concorrência/)).toBeInTheDocument();
  });
  it.each(["REPROVADO", "ORCAMENTO_VENCIDO"])("Técnico com Orçamentos reenvia %s, sem financeiro", async (status) => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    mockEnsureSensitiveAccess.mockImplementation(async ({ permission }) => !permission);
    equipamentoVerificado.status = status;
    equipamentoVerificado.prazo_aprovacao = "2027-01-20";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId(status === "REPROVADO" ? "action-reabrir_orcamento" : "action-renovar_orcamento"));
    if (status === "REPROVADO") fireEvent.click(await screen.findByRole("button", { name: /Nova proposta/ }));
    await screen.findByRole("button", { name: /Confirmar/i });
    await clicarConfirmarStatus();
    // Renovar passa pelo resumo do ajuste antes de gravar.
    const resumo = screen.queryByTestId("confirm-action");
    if (resumo) fireEvent.click(resumo);
    await waitFor(() => expect(mockAtualizarStatusEquipamento).toHaveBeenCalledWith(
      10, "AGUARDANDO_APROVACAO", 150, "2027-01-20", undefined, expect.any(String), undefined,
    ));
    expect(mockEnsureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ anyPermission: ["FINANCIAL_ACTIONS", "PREPARE_QUOTES"] }));
  });

  it("Marcar pronto pede só PIN de sessão", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    mockEnsureSensitiveAccess.mockImplementation(async ({ permission, anyPermission }) => !permission && !anyPermission);
    equipamentoVerificado.status = "EM_MANUTENCAO";
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-marcar_pronto"));
    await waitFor(() => expect(mockEnsureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ title: "Marcar equipamento como pronto" })));
    expect(mockEnsureSensitiveAccess.mock.calls[0][0]).not.toHaveProperty("permission");
    expect(mockEnsureSensitiveAccess.mock.calls[0][0]).not.toHaveProperty("anyPermission");
  });

  it("entrega com exceção, inclusive valor final zero, exige financeiro e não grava se negado", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    mockEnsureSensitiveAccess.mockImplementation(async ({ permission }) => !permission);
    equipamentoVerificado.status = "PRONTO";
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    render(<Equipamentos />);
    fireEvent.click(screen.getByTestId("action-registrar_entrega"));
    await screen.findByText(/Foto da saída \(entrega\)/);
    fireEvent.click(screen.getByRole("checkbox", { name: /Acordo excepcional/i }));
    fireEvent.change(screen.getByLabelText(/valor final/i), { target: { value: "0" } });
    await clicarConfirmarStatus();
    await waitFor(() => expect(mockEnsureSensitiveAccess).toHaveBeenLastCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" })));
    expect(mockAtualizarStatusEquipamento).not.toHaveBeenCalled();
    expect(mockSubstituirImagensEquipamento).not.toHaveBeenCalled();
  });


  describe("saída da edição e do ajuste pelo aviso 'Sair sem salvar?'", () => {
    const fotoEntrada = {
      id: 77, equipamento_id: 10, categoria: "ENTRADA", filename: "entrada.jpg", mime_type: "image/jpeg",
      tamanho_bytes: 123, largura: 800, altura: 600, ordem: 0, storage_path: "data:image/jpeg;base64,conteudo",
    };

    async function abrirEdicao() {
      render(<Equipamentos />);
      fireEvent.click(screen.getByTestId("action-editar"));
      await screen.findByRole("heading", { name: "Editar equipamento" });
    }

    it("edição limpa: a seta volta direto, sem aviso", async () => {
      await abrirEdicao();
      mockNavigate.mockClear();
      fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
      await waitFor(() => expect(screen.queryByRole("heading", { name: "Editar equipamento" })).not.toBeInTheDocument());
      expect(screen.queryByText("Sair sem salvar?")).not.toBeInTheDocument();
    });

    it.each([
      ["campo", () => fireEvent.change(screen.getByPlaceholderText("ZD421, GC420T"), { target: { value: "ZT999" } })],
      ["cliente", () => fireEvent.click(screen.getByRole("button", { name: "Trocar cliente (teste)" }))],
    ])("edição com %s alterado: a seta pergunta; continuar mantém, sair descarta", async (_nome, alterar) => {
      await abrirEdicao();
      alterar();
      mockNavigate.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
      expect(await screen.findByText("Sair sem salvar?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
      await waitFor(() => expect(screen.queryByText("Sair sem salvar?")).not.toBeInTheDocument());
      expect(screen.getByRole("heading", { name: "Editar equipamento" })).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockAtualizarEquipamento).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
      fireEvent.click(await screen.findByRole("button", { name: "Sair sem salvar" }));
      await waitFor(() => expect(screen.queryByRole("heading", { name: "Editar equipamento" })).not.toBeInTheDocument());
      expect(mockAtualizarEquipamento).not.toHaveBeenCalled();
    });

    it("edição com foto removida: a seta pergunta e, ao continuar, a foto segue fora", async () => {
      mockListarImagensEquipamento.mockResolvedValue([fotoEntrada]);
      await abrirEdicao();
      await screen.findByText("entrada.jpg");
      fireEvent.click(screen.getByRole("button", { name: "Remover entrada.jpg" }));

      fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
      expect(await screen.findByText("Sair sem salvar?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
      await waitFor(() => expect(screen.queryByText("Sair sem salvar?")).not.toBeInTheDocument());
      expect(screen.queryByText("entrada.jpg")).not.toBeInTheDocument();
      expect(mockSubstituirImagensEquipamento).not.toHaveBeenCalled();
    });

    it("edição alterada: Esc e Cancelar passam pelo mesmo aviso", async () => {
      await abrirEdicao();
      fireEvent.change(screen.getByPlaceholderText("ZD421, GC420T"), { target: { value: "ZT999" } });

      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(await screen.findByText("Sair sem salvar?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
      await waitFor(() => expect(screen.queryByText("Sair sem salvar?")).not.toBeInTheDocument());

      fireEvent.click(screen.getByRole("button", { name: /^Cancelar/ }));
      expect(await screen.findByText("Sair sem salvar?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
      await waitFor(() => expect(screen.queryByText("Sair sem salvar?")).not.toBeInTheDocument());
      expect(screen.getByPlaceholderText("ZD421, GC420T")).toHaveValue("ZT999");
    });

    async function abrirAjuste() {
      equipamentoVerificado.status = "EM_MANUTENCAO";
      mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
      render(<Equipamentos />);
      await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
      await act(async () => {
        fireEvent.click(screen.getByTestId("action-alterar_orcamento"));
      });
      await screen.findByRole("heading", { name: "Ajuste de orçamento" });
      await screen.findByText(/Fonte 24V/);
    }
    const setaDoAjuste = () => screen.getByRole("button", { name: /Zebra ZT230 ·/ });

    it("ajuste limpo: a seta volta direto, sem aviso", async () => {
      await abrirAjuste();
      fireEvent.click(setaDoAjuste());
      await waitFor(() => expect(screen.queryByRole("heading", { name: "Ajuste de orçamento" })).not.toBeInTheDocument());
      expect(screen.queryByText("Sair sem salvar?")).not.toBeInTheDocument();
    });

    it("ajuste alterado: a seta pergunta; continuar mantém, sair descarta", async () => {
      await abrirAjuste();
      fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "nova observação" } });

      fireEvent.click(setaDoAjuste());
      expect(await screen.findByText("Sair sem salvar?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Continuar editando" }));
      await waitFor(() => expect(screen.queryByText("Sair sem salvar?")).not.toBeInTheDocument());
      expect(screen.getByLabelText("Observações")).toHaveValue("nova observação");

      fireEvent.click(setaDoAjuste());
      fireEvent.click(await screen.findByRole("button", { name: "Sair sem salvar" }));
      await waitFor(() => expect(screen.queryByRole("heading", { name: "Ajuste de orçamento" })).not.toBeInTheDocument());
      expect(mockAtualizarServicosVerificacao).not.toHaveBeenCalled();
    });
  });
});
