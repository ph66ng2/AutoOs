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

// O menu "Mais" é um Select do Radix; no jsdom as ações viram botões simples.
vi.mock("@/components/ui/action-priority-row", () => ({
  ActionPriorityRow: ({ primary, secondary, overflow }: any) => (
    <div>
      {[primary, secondary, ...(overflow ?? [])].filter(Boolean).map((a: any) => (
        <button key={a.id} onClick={a.onClick} aria-expanded={a.ariaExpanded}>{a.label}</button>
      ))}
    </div>
  ),
}));

// Modal de contatos simplificado: só expõe o fechamento para testar o refresh da linha.
vi.mock("@/pages/clientes/ClientesDialogs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pages/clientes/ClientesDialogs")>()),
  ClientesContatosModal: ({ open, onOpenChange }: any) =>
    open ? <button onClick={() => onOpenChange(false)}>Fechar modal de contatos</button> : null,
}));

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

  it("mostra o contato que trouxe o cliente na busca, só quando o campo vier", () => {
    mocks.clientes = [clienteSalvo({ contato_encontrado: "Carlos Mendes" }), clienteSalvo({ id: 8, nome: "Bruno Lima" })];
    renderPagina();
    expect(screen.getAllByText(/^Contato:/)).toHaveLength(1);
    expect(screen.getByText("Contato: Carlos Mendes")).toBeInTheDocument();
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

  it("o botão Contatos expande a lista de contatos do cliente na linha", async () => {
    mocks.clientes = [clienteSalvo({ empresa_id: 3, contato_encontrado: "Carlos Mendes" })];
    dbMocks.listarClienteContatos.mockResolvedValue([
      { id: 1, empresa_id: 3, cliente_id: 7, nome: "Carlos Mendes", telefone: "71988887777", email: "carlos@x.com", ativo: true },
      { id: 2, empresa_id: 3, cliente_id: 7, nome: "Bruno Lima", ativo: true },
    ]);
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Contatos" }));
    expect(await screen.findByText("carlos@x.com")).toBeInTheDocument();
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    expect(dbMocks.listarClienteContatos).toHaveBeenCalledWith(7, 3);
    fireEvent.click(screen.getByRole("button", { name: "Contatos" }));
    expect(screen.queryByText("carlos@x.com")).not.toBeInTheDocument();
  });

  it("ignora a resposta atrasada de um cliente já recolhido/trocado", async () => {
    mocks.clientes = [
      clienteSalvo({ empresa_id: 3 }),
      clienteSalvo({ id: 8, nome: "Bruno Lima", documento: "11144477735", cpf_cnpj: "11144477735", empresa_id: 3 }),
    ];
    let resolverA!: (v: unknown[]) => void;
    dbMocks.listarClienteContatos.mockImplementation((id: number) =>
      id === 7 ? new Promise(r => { resolverA = r; }) : Promise.resolve([
        { id: 20, empresa_id: 3, cliente_id: 8, nome: "Contato do B", ativo: true },
      ]));
    renderPagina();
    const botoes = screen.getAllByRole("button", { name: "Contatos" });
    fireEvent.click(botoes[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Contatos" })[1]!);
    expect(await screen.findByText("Contato do B")).toBeInTheDocument();
    resolverA([{ id: 10, empresa_id: 3, cliente_id: 7, nome: "Contato do A", ativo: true }]);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText("Contato do A")).not.toBeInTheDocument();
    expect(screen.getByText("Contato do B")).toBeInTheDocument();
  });

  it("A→B→A: resposta antiga de A não sobrescreve a segunda expansão de A", async () => {
    mocks.clientes = [
      clienteSalvo({ empresa_id: 3 }),
      clienteSalvo({ id: 8, nome: "Bruno Lima", documento: "11144477735", cpf_cnpj: "11144477735", empresa_id: 3 }),
    ];
    const resolvers: Array<(v: unknown[]) => void> = [];
    dbMocks.listarClienteContatos.mockImplementation((id: number) =>
      id === 7 ? new Promise(r => { resolvers.push(r); }) : new Promise(() => {}));
    renderPagina();
    fireEvent.click(screen.getAllByRole("button", { name: "Contatos" })[0]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Contatos" })[1]!);
    fireEvent.click(screen.getAllByRole("button", { name: "Contatos" })[0]!);
    await waitFor(() => expect(resolvers).toHaveLength(2));
    resolvers[0]!([{ id: 10, empresa_id: 3, cliente_id: 7, nome: "A antigo", ativo: true }]);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByText("A antigo")).not.toBeInTheDocument();
    expect(screen.getByText("Carregando contatos...")).toBeInTheDocument();
    resolvers[1]!([{ id: 11, empresa_id: 3, cliente_id: 7, nome: "A fresco", ativo: true }]);
    expect(await screen.findByText("A fresco")).toBeInTheDocument();
  });

  it("cliente legado sem empresa_id mostra mensagem distinta e não busca contatos", async () => {
    mocks.clientes = [clienteSalvo({ empresa_id: null })];
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Contatos" }));
    expect(await screen.findByText(/sem empresa vinculada/i)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum contato cadastrado")).not.toBeInTheDocument();
    expect(dbMocks.listarClienteContatos).not.toHaveBeenCalled();
  });

  it("recarrega a lista expandida ao fechar o modal de contatos", async () => {
    mocks.clientes = [clienteSalvo({ empresa_id: 3 })];
    dbMocks.listarClienteContatos.mockResolvedValueOnce([
      { id: 1, empresa_id: 3, cliente_id: 7, nome: "Nome antigo", ativo: true },
    ]);
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Contatos" }));
    expect(await screen.findByText("Nome antigo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /gerenciar contatos e portal/i }));
    dbMocks.listarClienteContatos.mockResolvedValueOnce([
      { id: 1, empresa_id: 3, cliente_id: 7, nome: "Nome novo", ativo: true },
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "Fechar modal de contatos" }));
    expect(await screen.findByText("Nome novo")).toBeInTheDocument();
    expect(screen.queryByText("Nome antigo")).not.toBeInTheDocument();
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

describe("Clientes: PJ antigo sem celular na edição", () => {
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

  it("PJ antigo sem celular salva sem pedir contato", async () => {
    mocks.clientes = [clientePj()];
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(await screen.findByDisplayValue("Oficina Norte LTDA")).toBeInTheDocument();
    expect(screen.queryByText("Contato para orçamentos")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^(salvar|atualizar)/i }));
    await waitFor(() => expect(mocks.atualizar).toHaveBeenCalled());
    expect(mocks.atualizar.mock.calls[0]![0]).toBe(11);
    expect(mocks.atualizar.mock.calls[0]![2]).toBeUndefined();
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
