/**
 * Testes de divergência de orçamento no fluxo de ajuste de status
 *
 * Cobre:
 * - Detecção de divergência entre soma de serviços/peças e valor total informado
 * - Diálogo de divergência com opções "Corrigir" e "Continuar assim mesmo"
 * - Flag divergence passada para db.atualizarServicosVerificacao
 * - Indicador "Histórico de Ajustes" quando adjusted_at está presente
 * - Verificação dos parâmetros do audit (old_total, new_total, services counts)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";

// ─── Hoisted Mocks ──────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn(() => Promise.resolve(vi.fn())));
const mockNavigate = vi.hoisted(() => vi.fn());

const mockAtualizarServicosVerificacao = vi.hoisted(() => vi.fn());
const mockAtualizarStatusEquipamento = vi.hoisted(() => vi.fn());
const mockBuscarVerificacao = vi.hoisted(() => vi.fn());
const mockListarServicosCatalogoAtivos = vi.hoisted(() => vi.fn());
const mockListarImagensEquipamento = vi.hoisted(() => vi.fn());
const mockBuscarEquipamentosPorSerial = vi.hoisted(() => vi.fn());
const mockBuscarCliente = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: mockListen,
}));

vi.mock("react-router-dom", () => ({
  useLocation: () => ({ state: {}, pathname: "/equipamentos" }),
  useNavigate: () => mockNavigate,
}));

vi.mock("@/hooks/useEquipamentos", () => ({
  useEquipamentos: () => ({
    equipamentos: mockEquipamentos,
    loading: false,
    criar: vi.fn(),
    atualizar: vi.fn(),
    deletar: vi.fn(),
    atualizarStatus: mockAtualizarStatusEquipamento,
    recarregar: vi.fn(),
  }),
}));

vi.mock("@/hooks/useStatusEquipamento", () => ({
  useStatusEquipamento: () => ({
    loading: false,
    finalizarVerificacao: vi.fn(),
    marcarComoPronto: vi.fn(),
  }),
}));

vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({
    ensureSensitiveAccess: vi.fn().mockResolvedValue(true),
    status: { active_profile_id: 1, unlocked: true, permissions: ["FINANCIAL_ACTIONS"] },
  }),
}));

vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("@/lib/db", () => ({
  db: {
    buscarVerificacao: (...args: unknown[]) => mockBuscarVerificacao(...args),
    listarServicosCatalogoAtivos: (...args: unknown[]) => mockListarServicosCatalogoAtivos(...args),
    atualizarServicosVerificacao: (...args: unknown[]) => mockAtualizarServicosVerificacao(...args),
    atualizarStatusEquipamento: (...args: unknown[]) => mockAtualizarStatusEquipamento(...args),
    listarImagensEquipamento: (...args: unknown[]) => mockListarImagensEquipamento(...args),
    buscarEquipamentosPorSerial: (...args: unknown[]) => mockBuscarEquipamentosPorSerial(...args),
    buscarCliente: (...args: unknown[]) => mockBuscarCliente(...args),
    listarComunicacoes: vi.fn().mockResolvedValue([]),
    listarEquipamentos: vi.fn().mockResolvedValue([]),
    substituirImagensEquipamento: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/pdf-service", () => ({
  PdfService: {
    gerarOrcamento: vi.fn(),
    gerarOrdemServico: vi.fn(),
    gerarRelatorioStatus: vi.fn(),
  },
}));

vi.mock("@/lib/email-service", () => ({
  EmailService: {
    enviarOrdemEntrada: vi.fn(),
  },
}));

vi.mock("@/lib/whatsapp-service", () => ({
  WhatsAppService: {
    enviarOrcamento: vi.fn(),
    enviarEquipamentoPronto: vi.fn(),
  },
}));

vi.mock("@/components/equipamentos/ClienteSelector", () => ({
  ClienteSelector: () => <div data-testid="cliente-selector" />,
}));

vi.mock("@/components/equipamentos/PhotoUploadDialog", () => ({
  PhotoUploadDialog: () => <div data-testid="photo-upload-dialog" />,
}));

vi.mock("@/components/equipamentos/VerificacaoTecnica", () => ({
  VerificacaoTecnica: () => <div data-testid="verificacao-tecnica" />,
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
  GaleriaImagensEquipamento: () => <div data-testid="galeria-imagens" />,
}));

vi.mock("@/pages/equipamentos/EquipamentosStatusBadge", () => ({
  StatusBadge: ({ status }: any) => <span data-testid="status-badge">{status}</span>,
}));

vi.mock("@/components/ui/input-dialog", () => ({
  InputDialog: () => <div data-testid="input-dialog" />,
}));

vi.mock("@/components/ui/error-alert", () => ({
  ErrorAlert: () => <div data-testid="error-alert" />,
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
  status: "VERIFICADO",
  cliente_id: 1,
  cliente_nome: "Cliente A",
  cliente_telefone: "11999990001",
  cliente_email: "a@ex.com",
  valor_orcamento: 150,
  prazo_aprovacao: null,
  data_entrada: "2024-01-15",
  atualizado_em: "2024-01-15T10:00:00Z",
};

const mockEquipamentos = [equipamentoVerificado];

function makeVerificacao(opts?: { adjusted_at?: string; servicos?: any[]; pecas?: any[]; custo_total?: number }) {
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
    observacoes: "",
    adjusted_at: opts?.adjusted_at ?? null,
    adjusted_by_profile_id: opts?.adjusted_at ? 1 : null,
  };
}

// ─── Import Component ───────────────────────────────────

import Equipamentos from "../../Equipamentos";

describe("Equipamentos — Budget Divergence & Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListarImagensEquipamento.mockResolvedValue([]);
    mockBuscarEquipamentosPorSerial.mockResolvedValue([]);
    mockBuscarCliente.mockRejectedValue(new Error("no client"));
    mockListarServicosCatalogoAtivos.mockResolvedValue([]);
    mockAtualizarServicosVerificacao.mockResolvedValue(makeVerificacao());
    mockAtualizarStatusEquipamento.mockResolvedValue({ sucesso: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(screen.getByTestId("confirm-title")).toHaveTextContent(/Divergência detectada/i);
    expect(screen.getByTestId("confirm-description")).toHaveTextContent(/Divergência: soma dos serviços \(R\$ 150\.00\) ≠ valor total informado \(R\$ 200\.00\)/i);
    expect(screen.getByTestId("confirm-cancel")).toHaveTextContent(/Corrigir/i);
    expect(screen.getByTestId("confirm-action")).toHaveTextContent(/Continuar assim mesmo/i);
  });

  // ─── Test 3: "Corrigir" ajusta o total para a soma ───

  it('"Corrigir" define valorOrcamento = soma e mostra resumo normal', async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();

    await alterarValorOrcamento(200);
    await clicarConfirmarStatus();

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    // Clica em "Corrigir"
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-cancel"));
    });

    // O input de valor deve ter sido corrigido para 150
    const input = screen.getByTestId("valor-orcamento-input") as HTMLInputElement;
    expect(Number(input.value)).toBe(150);

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });
    expect(screen.getByTestId("confirm-title")).toHaveTextContent(/Resumo do Ajuste/i);
  });

  // ─── Test 4: "Continuar" salva com divergence=true ───

  it('"Continuar assim mesmo" chama atualizarServicosVerificacao com divergence=true', async () => {
    mockBuscarVerificacao.mockResolvedValue(makeVerificacao());
    await abrirDialogoAjusteOrcamento();

    await alterarValorOrcamento(200);
    await clicarConfirmarStatus();

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    // Clica em "Continuar assim mesmo"
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
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
    expect(profileId).toBe(1);
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
      expect(screen.getByTestId("confirm-title")).toHaveTextContent(/Divergência detectada/i);
    });
    expect(screen.getByTestId("confirm-description")).toHaveTextContent(/R\$ 100\.00.*R\$ 250\.00/);
  });
});
