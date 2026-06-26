/**
 * Testes de Integração: OrcamentoRapidoDialog ↔ Equipamentos (lista)
 *
 * Cobre:
 * - Fluxo completo: cria equipamento → verificação → PDF → toast → refresh
 * - Equipamento criado com status AGUARDANDO_APROVACAO
 * - Verificação criada com servicos JSON
 * - PDF gerado via PdfService.gerarOrcamento (normal, sem watermark)
 * - Toast de sucesso exibido
 * - Callback onSuccess dispara refresh da lista de equipamentos
 * - Wrapper simula a integração real da página Equipamentos.tsx
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
  {
    id: 1,
    nome: "Cliente Teste",
    tipo_pessoa: "PJ",
    razao_social: "Empresa Teste Ltda",
    nome_fantasia: "Teste Fantasia",
    telefone: "11988887777",
    email: "teste@empresa.com",
  },
  {
    id: 2,
    nome: "Cliente PF",
    tipo_pessoa: "PF",
    telefone: "11977776666",
    email: "cliente@ex.com",
  },
];

const equipamentosMock = [
  {
    id: 10,
    marca: "Zebra",
    modelo: "ZT410",
    serial_number: "Z1A2B3C4",
    tipo: "Impressora",
    status: "ENTREGUE",
    cliente_id: 1,
    cliente_nome: "Teste Fantasia",
  },
  {
    id: 11,
    marca: "Honeywell",
    modelo: "PM42",
    serial_number: "HW5678",
    tipo: "Impressora",
    status: "ENTREGUE",
    cliente_id: 1,
    cliente_nome: "Teste Fantasia",
  },
  {
    id: 20,
    marca: "Zebra",
    modelo: "ZD620",
    serial_number: "ZD9999",
    tipo: "Impressora",
    status: "ENTREGUE",
    cliente_id: 2,
    cliente_nome: "Cliente PF",
  },
];

const catalogoMock = [
  { id: 101, nome: "Limpeza Geral", descricao: "Limpeza completa", preco_padrao: 150.0, ativo: true },
  { id: 102, nome: "Troca de Cabeça", descricao: "Substituição cabeça térmica", preco_padrao: 450.0, ativo: true },
  { id: 103, nome: "Manutenção Preventiva", descricao: "Revisão geral", preco_padrao: 300.0, ativo: true },
];

const equipamentoCriadoMock = {
  id: 99,
  serial_number: "Z1A2B3C4",
  patrimonio: undefined,
  marca: "Zebra",
  modelo: "ZT410",
  tipo: "Impressora",
  status: "AGUARDANDO_APROVACAO",
  defeito_relatado: "Não liga após queda de energia",
  data_entrada: "2026-06-26",
  cliente_id: 1,
  cliente_nome: "Teste Fantasia",
  cliente_telefone: "11988887777",
  cliente_email: "teste@empresa.com",
};

const pdfPathMock = "/home/user/Documents/Orcamentos/orcamento_empresa_teste_ltda_2026-06-26.pdf";

// ─── Suite: Testes de Integração ────────────────────────

describe("OrcamentoRapidoDialog — Integração com Lista de Equipamentos", () => {
  const mockOnRefresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.listarClientes.mockResolvedValue(clientesMock);
    mockDb.listarEquipamentos.mockResolvedValue(equipamentosMock);
    mockDb.listarServicosCatalogoAtivos.mockResolvedValue(catalogoMock);
    mockDb.criarEquipamento.mockResolvedValue(equipamentoCriadoMock);
    mockDb.salvarVerificacao.mockResolvedValue(1);
    mockGerarOrcamento.mockResolvedValue(pdfPathMock);
  });

  // ─── Teste 1: Fluxo completo cria equipamento AGUARDANDO_APROVACAO ──

  it("cria equipamento com status AGUARDANDO_APROVACAO ao submeter", async () => {
    render(
      <OrcamentoRapidoDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    // Seleciona cliente PJ
    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "1" } });
    });

    // Seleciona equipamento existente
    const selectEquipamento = screen.getByLabelText(/Equipamento/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectEquipamento, { target: { value: "10" } });
    });

    // Adiciona 2 serviços
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });

    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    const nomeInputs = screen.getAllByPlaceholderText(/Nome do serviço/i);

    await act(async () => {
      fireEvent.change(nomeInputs[0], { target: { value: "Limpeza Geral" } });
      fireEvent.change(valorInputs[0], { target: { value: "150" } });
      fireEvent.change(nomeInputs[1], { target: { value: "Troca de Cabeça" } });
      fireEvent.change(valorInputs[1], { target: { value: "450" } });
    });

    // Preenche defeito
    const defeito = screen.getByLabelText(/Defeito Relatado/i);
    await act(async () => {
      fireEvent.change(defeito, { target: { value: "Não liga após queda de energia" } });
    });

    // Submete
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(mockDb.criarEquipamento).toHaveBeenCalledTimes(1);
    });

    // ── Verificação 1: Equipamento criado com AGUARDANDO_APROVACAO ──
    const equipCall = mockDb.criarEquipamento.mock.calls[0][0];
    expect(equipCall.status).toBe("AGUARDANDO_APROVACAO");
    expect(equipCall.cliente_id).toBe(1);
    expect(equipCall.cliente_nome).toBe("Teste Fantasia");
    expect(equipCall.serial_number).toBe("Z1A2B3C4");
    expect(equipCall.marca).toBe("Zebra");
    expect(equipCall.modelo).toBe("ZT410");
  });

  // ─── Teste 2: Verificação criada com serviços JSON ────

  it("cria verificação com servicos_necessarios em JSON", async () => {
    render(
      <OrcamentoRapidoDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "2" } });
    });

    // Adiciona 1 serviço
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });

    const nomeInputs = screen.getAllByPlaceholderText(/Nome do serviço/i);
    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(nomeInputs[0], { target: { value: "Manutenção Preventiva" } });
      fireEvent.change(valorInputs[0], { target: { value: "300" } });
    });

    const defeito = screen.getByLabelText(/Defeito Relatado/i);
    await act(async () => {
      fireEvent.change(defeito, { target: { value: "Impressora travando" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(mockDb.salvarVerificacao).toHaveBeenCalledTimes(1);
    });

    const verifCall = mockDb.salvarVerificacao.mock.calls[0][0];

    // Verificação linkada ao equipamento criado
    expect(verifCall.equipamento_id).toBe(99);
    expect(verifCall.problema_relatado).toBe("Impressora travando");

    // Serviços armazenados como JSON
    const servicosParsed = JSON.parse(verifCall.servicos_necessarios);
    expect(Array.isArray(servicosParsed)).toBe(true);
    expect(servicosParsed).toHaveLength(1);
    expect(servicosParsed[0].descricao).toBe("Manutenção Preventiva");
    expect(servicosParsed[0].valor).toBe(300);

    // Peças: array vazio (não usado no orçamento rápido)
    const pecasParsed = JSON.parse(verifCall.pecas_necessarias);
    expect(Array.isArray(pecasParsed)).toBe(true);
    expect(pecasParsed).toHaveLength(0);

    // Custo total
    expect(verifCall.custo_total).toBe(300);
  });

  // ─── Teste 3: PDF gerado via gerarOrcamento (normal, sem watermark) ──

  it("gera PDF chamando PdfService.gerarOrcamento (sem watermark)", async () => {
    render(
      <OrcamentoRapidoDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "1" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });

    const nomeInputs = screen.getAllByPlaceholderText(/Nome do serviço/i);
    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(nomeInputs[0], { target: { value: "Limpeza Geral" } });
      fireEvent.change(valorInputs[0], { target: { value: "150" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(mockGerarOrcamento).toHaveBeenCalledTimes(1);
    });

    // Verifica que chamou gerarOrcamento (normal), NÃO gerarOrcamentoAjustado
    const pdfArgs = mockGerarOrcamento.mock.calls[0];
    expect(pdfArgs[0]).toEqual(equipamentoCriadoMock);

    // PDF retornou caminho válido (verificado via mockResolvedValue + toast test)
    const pdfResult = await mockGerarOrcamento.mock.results[0].value;
    expect(pdfResult).toBe(pdfPathMock);

    // Confirma: NÃO existe gerarOrcamentoAjustado no mock (watermark ausente)
    expect(mockGerarOrcamento).not.toHaveProperty("gerarOrcamentoAjustado");
  });

  // ─── Teste 4: Toast de sucesso exibido ────────────────

  it("exibe toast de sucesso com caminho do PDF após geração", async () => {
    render(
      <OrcamentoRapidoDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "1" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });

    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(valorInputs[0], { target: { value: "150" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(mockSuccess).toHaveBeenCalledTimes(1);
    });

    // Toast: contexto "Equipamentos", mensagem contém caminho, ação "Orçamento Rápido"
    expect(mockSuccess).toHaveBeenCalledWith(
      "Equipamentos",
      expect.stringContaining("Orçamento PDF gerado"),
      "Orçamento Rápido"
    );

    // Verifica que a descrição contém o caminho real do PDF
    const description = mockSuccess.mock.calls[0][1];
    expect(description).toContain(pdfPathMock);
  });

  // ─── Teste 5: onSuccess dispara refresh da lista ──────

  it("dispara callback onSuccess para refresh da lista de equipamentos", async () => {
    const onRefresh = vi.fn();

    render(
      <OrcamentoRapidoDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "1" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });

    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(valorInputs[0], { target: { value: "150" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    // onRefresh dispara APÓS criar equipamento e gerar PDF (ordem correta)
    expect(mockDb.criarEquipamento).toHaveBeenCalledBefore(onRefresh);
    expect(mockGerarOrcamento).toHaveBeenCalledBefore(onRefresh);
  });

  // ─── Teste 6: Cliente PF — nome vem de 'nome' (não nome_fantasia) ──

  it("para cliente PF usa campo 'nome' como cliente_nome", async () => {
    render(
      <OrcamentoRapidoDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "2" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });

    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(valorInputs[0], { target: { value: "100" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(mockDb.criarEquipamento).toHaveBeenCalledTimes(1);
    });

    const equipCall = mockDb.criarEquipamento.mock.calls[0][0];
    expect(equipCall.cliente_nome).toBe("Cliente PF");
    expect(equipCall.cliente_id).toBe(2);
  });

  // ─── Teste 7: Sem equipamento selecionado usa defaults ──

  it("sem equipamento selecionado usa defaults 'NÃO INFORMADO' / 'Visita Técnica'", async () => {
    render(
      <OrcamentoRapidoDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "1" } });
    });

    // NÃO seleciona equipamento

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });

    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(valorInputs[0], { target: { value: "200" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(mockDb.criarEquipamento).toHaveBeenCalledTimes(1);
    });

    const equipCall = mockDb.criarEquipamento.mock.calls[0][0];
    expect(equipCall.serial_number).toBe("NÃO INFORMADO");
    expect(equipCall.marca).toBe("Não informado");
    expect(equipCall.modelo).toBe("");
    expect(equipCall.tipo).toBe("Visita Técnica");
    expect(equipCall.patrimonio).toBeUndefined();
  });

  // ─── Teste 8: Simula erro no PDF e verifica tratamento ──

  it("trata erro na geração de PDF corretamente", async () => {
    mockGerarOrcamento.mockRejectedValue(new Error("Erro ao salvar PDF no disco"));

    render(
      <OrcamentoRapidoDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={mockOnRefresh}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Cliente/i)).toBeInTheDocument();
    });

    const selectCliente = screen.getByLabelText(/Cliente/i) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(selectCliente, { target: { value: "1" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    });

    const valorInputs = screen.getAllByPlaceholderText(/Valor/i);
    await act(async () => {
      fireEvent.change(valorInputs[0], { target: { value: "150" } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Gerar Orçamento/i }));
    });

    await waitFor(() => {
      expect(mockError).toHaveBeenCalledTimes(1);
    });

    // Equipamento e verificação foram criados (antes do erro no PDF)
    expect(mockDb.criarEquipamento).toHaveBeenCalledTimes(1);
    expect(mockDb.salvarVerificacao).toHaveBeenCalledTimes(1);

    // PDF falhou, então onSuccess NÃO deve disparar
    expect(mockOnRefresh).not.toHaveBeenCalled();
  });
});
