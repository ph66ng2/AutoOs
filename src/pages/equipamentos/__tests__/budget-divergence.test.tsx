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
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ─── Hoisted Mocks ──────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn());
const mockListen = vi.hoisted(() => vi.fn(() => Promise.resolve(vi.fn())));
const mockNavigate = vi.hoisted(() => vi.fn());

const mockPermissions = vi.hoisted(() => ({ list: ["FINANCIAL_ACTIONS"] as string[] }));
const mockEnsureSensitiveAccess = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const mockAtualizarServicosVerificacao = vi.hoisted(() => vi.fn());
const mockAnalisarAjusteOrcamento = vi.hoisted(() => vi.fn());
const mockAprovarOrcamento = vi.hoisted(() => vi.fn());
const mockAtualizarStatusEquipamento = vi.hoisted(() => vi.fn());
const mockBuscarVerificacao = vi.hoisted(() => vi.fn());
const mockListarServicosCatalogoAtivos = vi.hoisted(() => vi.fn());
const mockListarImagensEquipamento = vi.hoisted(() => vi.fn());
const mockBuscarEquipamentosPorSerial = vi.hoisted(() => vi.fn());
const mockBuscarCliente = vi.hoisted(() => vi.fn());
const mockRecarregar = vi.hoisted(() => vi.fn());

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
    total: 1,
    loading: false,
    criar: vi.fn(),
    atualizar: vi.fn(),
    deletar: vi.fn(),
    atualizarStatus: mockAtualizarStatusEquipamento,
    recarregar: mockRecarregar,
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
    ensureSensitiveAccess: (...args: unknown[]) => mockEnsureSensitiveAccess(...args),
    status: { active_profile_id: 1, unlocked: true, permissions: mockPermissions.list },
    hasPermission: (permission: string) => mockPermissions.list.includes(permission),
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
    listarProdutos: vi.fn().mockResolvedValue([]),
    buscarEquipamento: vi.fn().mockResolvedValue({ atualizado_em: "2024-01-15T10:00:01Z" }),
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
    substituirImagensEquipamento: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/pdf-service", () => ({
  PRAZO_EXECUCAO_PADRAO: { minDiasUteis: 2, maxDiasUteis: 4 },
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

describe("Equipamentos — Budget Divergence & Audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions.list = ["FINANCIAL_ACTIONS"];
    mockEnsureSensitiveAccess.mockResolvedValue(true);
    equipamentoVerificado.status = "VERIFICADO";
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
    expect(cells[0].className).toContain("after:border-[#1d4ed8]");
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

  it("PREPARE_QUOTES não mostra Aprovar nem Reprovar", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    equipamentoVerificado.status = "AGUARDANDO_APROVACAO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-alterar_orcamento")).toBeInTheDocument());
    expect(screen.queryByTestId("action-aprovar")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-reprovar")).not.toBeInTheDocument();
  });

  it("PREPARE_QUOTES não mostra Alterar Orçamento em APROVADO", async () => {
    mockPermissions.list = ["PREPARE_QUOTES"];
    equipamentoVerificado.status = "APROVADO";
    render(<Equipamentos />);
    await waitFor(() => expect(screen.getByTestId("action-iniciar_manutencao")).toBeInTheDocument());
    expect(screen.queryByTestId("action-alterar_orcamento")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-corrigir_decisao")).not.toBeInTheDocument();
  });

  it("Técnico sem financeiro não vê Reabrir, Ajustar vencido nem Corrigir decisão", async () => {
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
    expect(screen.queryByTestId("action-ajustar_orcamento_vencido")).not.toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByTestId("confirm-action")).toHaveTextContent("Confirmar garantia"));
    fireEvent.click(screen.getByTestId("confirm-action"));
    await waitFor(() => expect(mockEnsureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({
      permission: "FINANCIAL_ACTIONS",
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
});
