/**
 * Testes do OrcamentoRapidoDialog — formulário enxuto de orçamento rápido
 *
 * Cobre:
 * - Renderização dos 5 campos (Cliente, Equipamento, Serviços, Valor, Defeito)
 * - Filtragem de equipamentos por cliente
 * - Adição/remoção de serviços com auto-complete do catálogo
 * - Cálculo automático do valor total
 * - Submissão: cria equipamento + verificação + gera PDF
 * - Toast de sucesso após criação
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { OrcamentoRapidoDialog } from "../OrcamentoRapidoDialog";

// ─── Mocks ──────────────────────────────────────────────

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockSuccess = vi.hoisted(() => vi.fn());
const mockError = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({
    success: mockSuccess,
    error: mockError,
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

const mockGerarOrcamento = vi.hoisted(() => vi.fn());
vi.mock("@/lib/pdf-service", () => ({
  PdfService: {
    gerarOrcamento: mockGerarOrcamento,
  },
}));

const mockDb = vi.hoisted(() => ({
  listarClientes: vi.fn(),
  listarEquipamentos: vi.fn(),
  listarServicosCatalogoAtivos: vi.fn(),
  criarEquipamento: vi.fn(),
  salvarVerificacao: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

// ─── Fixtures ───────────────────────────────────────────

const clientesMock = [
  { id: 1, nome: "Cliente A", tipo_pessoa: "PF", telefone: "11999990001", email: "a@ex.com" },
  { id: 2, nome: "Cliente B", tipo_pessoa: "PJ", razao_social: "B Ltda", nome_fantasia: "B Fantasia", telefone: "11999990002", email: "b@ex.com" },
];

const equipamentosMock = [
  { id: 10, marca: "Zebra", modelo: "ZT230", serial_number: "SN001", tipo: "Impressora", status: "ENTREGUE", cliente_id: 1, cliente_nome: "Cliente A" },
  { id: 11, marca: "Zebra", modelo: "ZD420", serial_number: "SN002", tipo: "Impressora", status: "ENTREGUE", cliente_id: 1, cliente_nome: "Cliente A" },
  { id: 20, marca: "Honeywell", modelo: "PC42", serial_number: "SN003", tipo: "Impressora", status: "ENTREGUE", cliente_id: 2, cliente_nome: "Cliente B" },
];

const catalogoMock = [
  { id: 101, nome: "Limpeza Geral", descricao: "Limpeza completa", preco_padrao: 150.0, ativo: true },
  { id: 102, nome: "Troca de Cabeça", descricao: "Substituição cabeça térmica", preco_padrao: 450.0, ativo: true },
];

// ─── Suite ──────────────────────────────────────────────

describe("OrcamentoRapidoDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.listarClientes.mockResolvedValue(clientesMock);
    mockDb.listarEquipamentos.mockResolvedValue(equipamentosMock);
    mockDb.listarServicosCatalogoAtivos.mockResolvedValue(catalogoMock);
    mockDb.criarEquipamento.mockResolvedValue({
      id: 99,
      serial_number: "SN001",
      marca: "Zebra",
      modelo: "ZT230",
      tipo: "Impressora",
      status: "AGUARDANDO_APROVACAO",
      cliente_id: 1,
      cliente_nome: "Cliente A",
    });
    mockDb.salvarVerificacao.mockResolvedValue(1);
    mockGerarOrcamento.mockResolvedValue("/documents/orcamento_99.pdf");
  });

  // ─── Teste 1: Renderização dos campos ────────────────

  it("renderiza os 5 campos principais e o label 'Orçamento Rápido'", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Orçamento Rápido")).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Equipamento/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar Serviço/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Valor total/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Defeito Relatado/i)).toBeInTheDocument();
  });

  // ─── Teste 2: Carrega dados ao abrir ─────────────────

  it("carrega clientes, equipamentos e catálogo ao montar", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(mockDb.listarClientes).toHaveBeenCalled();
      expect(mockDb.listarEquipamentos).toHaveBeenCalled();
      expect(mockDb.listarServicosCatalogoAtivos).toHaveBeenCalled();
    });
  });

  // ─── Teste 3: Filtragem de equipamentos por cliente ──

  it("filtra equipamentos no dropdown quando um cliente é selecionado", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;

    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "1" } });
    });

    const selectEquipamento = screen.getByLabelText(/Equipamento/i) as HTMLSelectElement;
    const options = Array.from(selectEquipamento.querySelectorAll("option"));
    const values = options.map((o) => o.value);

    // Deve ter placeholder + equipamentos do cliente 1 (2 equipamentos)
    expect(values).toContain("10");
    expect(values).toContain("11");
    expect(values).not.toContain("20");
  });

  // ─── Teste 4: Adicionar serviço do catálogo ──────────

  it("adiciona serviço do catálogo e preenche valor com preco_padrao", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Adicionar Serviço/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/Adicionar Serviço/i));
    });

    const inputs = screen.getAllByPlaceholderText(/Nome do serviço/i);
    expect(inputs.length).toBeGreaterThanOrEqual(1);

    const inputServico = inputs[0];

    await act(async () => {
      fireEvent.focus(inputServico);
      fireEvent.change(inputServico, { target: { value: "Limpeza" } });
    });

    await waitFor(() => {
      expect(screen.getByText(/Limpeza Geral/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.mouseDown(screen.getByText(/Limpeza Geral/i));
      fireEvent.click(screen.getByText(/Limpeza Geral/i));
    });

    // O valor deve ser preenchido com 150.00
    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    expect(valorInputs[0]).toHaveValue(150);
  });

  // ─── Teste 5: Cálculo automático do valor total ──────

  it("calcula valor total automaticamente a partir dos serviços", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Adicionar Serviço/i)).toBeInTheDocument();
    });

    // Adiciona 2 serviços
    await act(async () => {
      fireEvent.click(screen.getByText(/Adicionar Serviço/i));
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/Adicionar Serviço/i));
    });

    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);

    await act(async () => {
      fireEvent.change(valorInputs[0], { target: { value: "100" } });
      fireEvent.change(valorInputs[1], { target: { value: "250.5" } });
    });

    const valorTotal = screen.getByLabelText(/Valor total/i) as HTMLInputElement;
    expect(valorTotal.value).toBe("350.5");
  });

  // ─── Teste 6: Valor total é editável ─────────────────

  it("permite editar o valor total manualmente", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Valor total/i)).toBeInTheDocument();
    });

    const valorTotal = screen.getByLabelText(/Valor total/i) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(valorTotal, { target: { value: "999.99" } });
    });

    expect(valorTotal.value).toBe("999.99");
  });

  // ─── Teste 7: Submissão cria equipamento + verificação + PDF

  it("ao submeter cria equipamento, verificação e gera PDF", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    // Seleciona cliente
    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "1" } });
    });

    // Seleciona equipamento
    const selectEquipamento = screen.getByLabelText(/Equipamento/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectEquipamento, { target: { value: "10" } });
    });

    // Adiciona serviço
    await act(async () => {
      fireEvent.click(screen.getByText(/Adicionar Serviço/i));
    });

    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(valorInputs[0], { target: { value: "150" } });
    });

    // Preenche defeito
    const defeito = screen.getByLabelText(/Defeito Relatado/i);
    await act(async () => {
      fireEvent.change(defeito, { target: { value: "Não liga" } });
    });

    // Submete
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(mockDb.criarEquipamento).toHaveBeenCalled();
    });

    // Verifica que o equipamento foi criado com status AGUARDANDO_APROVACAO
    const equipCall = mockDb.criarEquipamento.mock.calls[0][0];
    expect(equipCall.status).toBe("AGUARDANDO_APROVACAO");
    expect(equipCall.cliente_id).toBe(1);

    // Verifica que a verificação foi salva com serviços JSON
    expect(mockDb.salvarVerificacao).toHaveBeenCalled();
    const verifCall = mockDb.salvarVerificacao.mock.calls[0][0];
    expect(verifCall.equipamento_id).toBe(99);
    expect(verifCall.problema_relatado).toBe("Não liga");
    expect(JSON.parse(verifCall.servicos_necessarios)).toHaveLength(1);

    // Verifica que o PDF foi gerado
    expect(mockGerarOrcamento).toHaveBeenCalled();
  });

  // ─── Teste 8: Toast de sucesso ───────────────────────

  it("exibe toast de sucesso após gerar orçamento", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "1" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(mockSuccess).toHaveBeenCalledWith(
        "Equipamentos",
        expect.stringContaining("Orçamento PDF gerado"),
        "Orçamento Rápido"
      );
    });
  });

  // ─── Teste 9: Remove serviço ─────────────────────────

  it("remove serviço da lista e recalcula total", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText(/Adicionar Serviço/i)).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/Adicionar Serviço/i));
    });

    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(valorInputs[0], { target: { value: "100" } });
    });

    // Adiciona mais um
    await act(async () => {
      fireEvent.click(screen.getByText(/Adicionar Serviço/i));
    });

    const valorInputs2 = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(valorInputs2[1], { target: { value: "200" } });
    });

    const valorTotal = screen.getByLabelText(/Valor total/i) as HTMLInputElement;
    expect(valorTotal.value).toBe("300");

    // Remove o primeiro
    const removeButtons = screen.getAllByRole("button", { name: /Remover/i });
    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });

    expect(valorTotal.value).toBe("200");
  });

  // ─── Teste 10: Validação de cliente obrigatório ──────

  it("não permite submeter sem selecionar um cliente", async () => {
    render(<OrcamentoRapidoDialog {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Gerar Orçamento/i })).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    expect(mockDb.criarEquipamento).not.toHaveBeenCalled();
    expect(screen.getByText("Selecione um cliente.")).toBeInTheDocument();
  });
});
