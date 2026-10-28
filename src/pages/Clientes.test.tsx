import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Clientes from "@/pages/Clientes";

const mocks = vi.hoisted(() => ({
  criar: vi.fn(),
  atualizar: vi.fn(),
  clientes: [] as unknown[],
}));

vi.mock("@/hooks/useClientes", () => ({
  useClientes: () => ({
    clientes: mocks.clientes, total: mocks.clientes.length, loading: false, error: null,
    criar: mocks.criar, atualizar: mocks.atualizar, deletar: vi.fn(), recarregar: vi.fn(),
  }),
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ ensureSensitiveAccess: vi.fn() }) }));
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));
const dbMocks = vi.hoisted(() => ({
  listarEquipamentosCliente: vi.fn().mockResolvedValue([]),
  listarClienteContatos: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));

const CPF = "529.982.247-25";

function clienteSalvo(extra: Record<string, unknown> = {}) {
  return {
    id: 7, tipo_pessoa: "PF", nome: "Ana Souza", documento: "52998224725", cpf_cnpj: "52998224725",
    telefone: "71999990000", receber_email: false, receber_whatsapp: false,
    exige_ordem_compra: false, atualizado_em: "2026-10-01 10:00:00", ativo: true, ...extra,
  };
}

function renderPagina() {
  return render(<MemoryRouter><Clientes /></MemoryRouter>);
}

describe("Clientes: ordem de compra e preferências", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientes = [];
    mocks.criar.mockResolvedValue({ sucesso: true });
    mocks.atualizar.mockResolvedValue({ sucesso: true });
    dbMocks.listarEquipamentosCliente.mockResolvedValue([]);
    dbMocks.listarClienteContatos.mockResolvedValue([]);
  });

  it("mostra o selo Exige OC só para quem exige", () => {
    mocks.clientes = [clienteSalvo({ exige_ordem_compra: true }), clienteSalvo({ id: 8, nome: "Bruno Lima" })];
    renderPagina();
    expect(screen.getAllByText("Exige OC")).toHaveLength(1);
  });

  it("cria cliente com o checkbox marcado e preferências true por padrão", async () => {
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: /novo cliente/i }));
    fireEvent.change(await screen.findByLabelText(/CPF ou CNPJ/i), { target: { value: CPF } });
    fireEvent.change(await screen.findByPlaceholderText("Nome completo do cliente"), { target: { value: "Carla Dias" } });
    const check = screen.getByLabelText(/exige ordem de compra para aprovar orçamentos/i);
    expect(check).not.toBeChecked();
    fireEvent.click(check);
    fireEvent.click(screen.getByRole("button", { name: /^(salvar|criar|cadastrar)/i }));
    await waitFor(() => expect(mocks.criar).toHaveBeenCalled());
    expect(mocks.criar.mock.calls[0]![0]).toMatchObject({
      exige_ordem_compra: true, receber_email: true, receber_whatsapp: true,
    });
  });

  it("na edição preserva receber_email/receber_whatsapp salvos e envia a opção de OC", async () => {
    mocks.clientes = [clienteSalvo({ exige_ordem_compra: true })];
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    const check = await screen.findByLabelText(/exige ordem de compra para aprovar orçamentos/i);
    expect(check).toBeChecked();
    fireEvent.click(check);
    fireEvent.click(screen.getByRole("button", { name: /^(salvar|atualizar)/i }));
    await waitFor(() => expect(mocks.atualizar).toHaveBeenCalled());
    expect(mocks.atualizar.mock.calls[0]![0]).toBe(7);
    expect(mocks.atualizar.mock.calls[0]![1]).toMatchObject({
      exige_ordem_compra: false, receber_email: false, receber_whatsapp: false,
    });
  });
});

describe("Clientes: PJ legado sem celular na edição", () => {
  const cnpj = "57522734000158";

  function clientePj(extra: Record<string, unknown> = {}) {
    return clienteSalvo({
      id: 11,
      empresa_id: 3,
      tipo_pessoa: "PJ",
      nome: "Oficina Norte",
      razao_social: "Oficina Norte LTDA",
      nome_fantasia: "Oficina Norte",
      documento: cnpj,
      cpf_cnpj: cnpj,
      telefone: "7133334444",
      ...extra,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.criar.mockResolvedValue({ sucesso: true });
    mocks.atualizar.mockResolvedValue({ sucesso: true });
    dbMocks.listarClienteContatos.mockResolvedValue([]);
  });

  it("pede o contato quando o PJ não tem celular ativo", async () => {
    dbMocks.listarClienteContatos.mockResolvedValue([
      { id: 1, empresa_id: 3, cliente_id: 11, nome: "Recepção", telefone: "7133334444", ativo: true },
    ]);
    mocks.clientes = [clientePj()];
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(await screen.findByText("Contato para orçamentos")).toBeInTheDocument();
    expect(screen.getByLabelText(/nome do contato/i)).toBeInTheDocument();
    expect(dbMocks.listarClienteContatos).toHaveBeenCalledWith(11, 3);
  });

  it("não aplica o formulário de um PJ se outro Editar já abriu no meio", async () => {
    const cnpjB = "19131243000197";
    let liberarA: (contatos: unknown[]) => void = () => {};
    dbMocks.listarClienteContatos.mockImplementation((clienteId: number) => {
      if (clienteId === 11) {
        return new Promise((resolve) => {
          liberarA = resolve;
        });
      }
      return Promise.resolve([
        { id: 9, empresa_id: 3, cliente_id: 12, nome: "Carla", telefone: "71988887777", ativo: true },
      ]);
    });
    mocks.clientes = [
      clientePj(),
      clientePj({
        id: 12,
        nome: "Sul Peças",
        razao_social: "Sul Pecas LTDA",
        nome_fantasia: "Sul Peças",
        documento: cnpjB,
        cpf_cnpj: cnpjB,
      }),
    ];
    renderPagina();
    const editar = screen.getAllByRole("button", { name: /editar/i });
    fireEvent.click(editar[0]!);
    fireEvent.click(editar[1]!);
    expect(await screen.findByDisplayValue("Sul Pecas LTDA")).toBeInTheDocument();
    liberarA([
      { id: 1, empresa_id: 3, cliente_id: 11, nome: "Recepção", telefone: "7133334444", ativo: true },
    ]);
    await waitFor(() => expect(dbMocks.listarClienteContatos).toHaveBeenCalledWith(11, 3));
    expect(screen.getByDisplayValue("Sul Pecas LTDA")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Oficina Norte LTDA")).not.toBeInTheDocument();
    expect(screen.queryByText("Contato para orçamentos")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^(salvar|atualizar)/i }));
    await waitFor(() => expect(mocks.atualizar).toHaveBeenCalled());
    expect(mocks.atualizar.mock.calls[0]![0]).toBe(12);
    expect(mocks.atualizar.mock.calls[0]![1]).toMatchObject({
      razao_social: "Sul Pecas LTDA",
      documento: cnpjB,
    });
  });

  it("não pede contato extra quando o PJ já tem celular", async () => {
    dbMocks.listarClienteContatos.mockResolvedValue([
      { id: 2, empresa_id: 3, cliente_id: 11, nome: "Ana", telefone: "71988887777", ativo: true },
    ]);
    mocks.clientes = [clientePj()];
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(await screen.findByLabelText(/exige ordem de compra para aprovar orçamentos/i)).toBeInTheDocument();
    expect(screen.queryByText("Contato para orçamentos")).not.toBeInTheDocument();
  });
});
