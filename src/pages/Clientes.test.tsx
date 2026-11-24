import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Clientes from "@/pages/Clientes";
import { distribuirMudancas } from "@/lib/ao-vivo";

const mocks = vi.hoisted(() => ({
  status: { unlocked: true, active_profile_id: 1, permissions: [] as string[] },
  criar: vi.fn(),
  atualizar: vi.fn(),
  clientes: [] as unknown[],
  erro: null as string | null,
  recarregar: vi.fn(),
}));

vi.mock("@/hooks/useClientes", () => ({
  useClientes: () => ({
    clientes: mocks.clientes, total: mocks.clientes.length, loading: false, error: mocks.erro,
    criar: mocks.criar, atualizar: mocks.atualizar, deletar: vi.fn(), recarregar: mocks.recarregar,
  }),
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({
  ensureSensitiveAccess: vi.fn(),
  status: mocks.status,
  hasPermission: (permissao: string) => mocks.status.unlocked && mocks.status.permissions.includes(permissao),
}) }));
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));
const dbMocks = vi.hoisted(() => ({
  resumoCliente: vi.fn(),
  contarClientesPorFiltro: vi.fn().mockResolvedValue(null),
  listarEquipamentosCliente: vi.fn().mockResolvedValue([]),
  listarClienteContatos: vi.fn().mockResolvedValue([]),
  abrirUrl: vi.fn().mockResolvedValue(undefined),
  listarModelosMensagem: vi.fn().mockResolvedValue([{ id: 1, titulo: "Equipamento pronto", texto: "Olá, {contato}! Está pronto.", ordem: 1 }]),
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
    mocks.status = { unlocked: true, active_profile_id: 1, permissions: [] };
    dbMocks.resumoCliente.mockReset().mockResolvedValue({ osAbertas: 1, noAno: 2, faturado: null });
    mocks.clientes = [];
    mocks.erro = null;
    mocks.criar.mockResolvedValue({ sucesso: true });
    mocks.atualizar.mockResolvedValue({ sucesso: true });
    dbMocks.listarEquipamentosCliente.mockResolvedValue([]);
    dbMocks.listarClienteContatos.mockResolvedValue([]);
  });

  it("lista que não carregou (banco fora) não mostra o convite de base vazia e oferece tentar de novo", async () => {
    mocks.erro = "A conexão com o banco excedeu 6 segundos.";
    renderPagina();
    expect(screen.getByText("Não foi possível carregar os clientes")).toBeInTheDocument();
    expect(screen.queryByText("Nenhum cliente encontrado")).not.toBeInTheDocument();
    expect(screen.queryByText(/Clique em "Novo cliente"/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(mocks.recarregar).toHaveBeenCalled();
  });

  it("base vazia de verdade continua com o convite para cadastrar", () => {
    renderPagina();
    expect(screen.getByText("Nenhum cliente encontrado")).toBeInTheDocument();
    expect(screen.queryByText("Não foi possível carregar os clientes")).not.toBeInTheDocument();
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

  it("atualiza o resumo em segundo plano e pelo botão de atualizar", async () => {
    mocks.clientes = [clienteSalvo()];
    const resumo = { osAbertas: 41, noAno: 52, faturado: null };
    dbMocks.resumoCliente.mockResolvedValueOnce(resumo);
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    expect(await screen.findByText("41")).toBeVisible();

    let responder!: (dados: typeof resumo) => void;
    dbMocks.resumoCliente.mockReturnValueOnce(new Promise((resolve) => { responder = resolve; }));
    act(() => distribuirMudancas([{ tabela: "equipamentos", id: 1, referencia: null, operacao: "U" }]));
    expect(dbMocks.resumoCliente).toHaveBeenLastCalledWith(7, true);
    expect(screen.getByText("41")).toBeVisible();

    dbMocks.resumoCliente.mockResolvedValueOnce({ ...resumo, osAbertas: 43 });
    fireEvent.click(screen.getByRole("button", { name: "Atualizar clientes" }));
    expect(dbMocks.resumoCliente).toHaveBeenLastCalledWith(7, false);
    expect(await screen.findByText("43")).toBeVisible();
    await act(async () => responder({ ...resumo, osAbertas: 42 }));
    expect(screen.queryByText("42")).not.toBeInTheDocument();

    dbMocks.resumoCliente.mockResolvedValueOnce({ ...resumo, osAbertas: 44 });
    act(() => distribuirMudancas([{ tabela: "equipamentos", id: 2, referencia: null, operacao: "I" }]));
    expect(await screen.findByText("44")).toBeVisible();
  });

  it("protege o faturado ao mudar de perfil, permissão ou bloqueio", async () => {
    mocks.clientes = [clienteSalvo()];
    mocks.status.permissions = ["VIEW_EXPENSES"];
    const resumo = { osAbertas: 1, noAno: 2, faturado: 1500 };
    dbMocks.resumoCliente.mockResolvedValue(resumo);
    const { rerender } = renderPagina();
    const atualizarSessao = () => rerender(<MemoryRouter><Clientes /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    expect(await screen.findByText("Faturado")).toBeVisible();

    let responderAntiga!: (dados: typeof resumo) => void;
    dbMocks.resumoCliente.mockImplementationOnce(() => new Promise((resolve) => {
      responderAntiga = resolve;
    }));
    mocks.status = { ...mocks.status, active_profile_id: 2 };
    atualizarSessao();
    expect(screen.queryByText("Faturado")).not.toBeInTheDocument();

    mocks.status = { ...mocks.status, permissions: [] };
    atualizarSessao();
    expect(dbMocks.resumoCliente).toHaveBeenCalledTimes(3);
    await act(async () => responderAntiga({ ...resumo, osAbertas: 99 }));
    expect(screen.queryByText("Faturado")).not.toBeInTheDocument();
    expect(screen.queryByText("99")).not.toBeInTheDocument();

    mocks.status = { ...mocks.status, permissions: ["VIEW_EXPENSES"] };
    atualizarSessao();
    expect(await screen.findByText("Faturado")).toBeVisible();

    mocks.status = { ...mocks.status, unlocked: false };
    atualizarSessao();
    expect(screen.queryByText("Faturado")).not.toBeInTheDocument();
    expect(dbMocks.resumoCliente).toHaveBeenCalledTimes(4);

    mocks.status = { ...mocks.status, unlocked: true };
    atualizarSessao();
    expect(await screen.findByText("Faturado")).toBeVisible();
    expect(dbMocks.resumoCliente).toHaveBeenCalledTimes(5);
  });

  it("painel do cliente: WhatsApp abre o wa.me do telefone e o telefone tem copiar", async () => {
    mocks.clientes = [clienteSalvo({ email: "ana@x.com" })];
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    // "WhatsApp ▾": escolher uma mensagem pronta abre a conversa com o texto preenchido.
    // O Select do Radix precisa destes dois no jsdom.
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.scrollIntoView = () => undefined;
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole("combobox", { name: "Abrir WhatsApp com uma mensagem" }));
    await usuario.click(await screen.findByRole("option", { name: /Equipamento pronto/ }));
    expect(dbMocks.abrirUrl).toHaveBeenCalledWith(`https://wa.me/5571999990000?text=${encodeURIComponent("Olá, Ana Souza! Está pronto.")}`);
    expect(screen.getByRole("button", { name: "Copiar telefone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar e-mail" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar CPF/CNPJ" })).toBeInTheDocument();
  });

  it("painel do cliente: Nova entrada abre a página já com este cliente e volta para Clientes", async () => {
    mocks.clientes = [clienteSalvo()];
    function EstadoDaRota() {
      const location = useLocation();
      return <pre data-testid="estado">{JSON.stringify(location.state)}</pre>;
    }
    render(
      <MemoryRouter initialEntries={["/clientes"]}>
        <Routes>
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/equipamentos/nova" element={<EstadoDaRota />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    fireEvent.click(await screen.findByRole("button", { name: "Nova entrada" }));
    expect(JSON.parse(screen.getByTestId("estado").textContent ?? "{}")).toEqual({ origem: "/clientes", clienteId: 7 });
  });

  it("Ver todos marca + quando o painel chegou ao limite de 200 OS", async () => {
    mocks.clientes = [clienteSalvo()];
    const os = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, cliente_id: 7, marca: "Fluke", modelo: "87V", data_entrada: "2026-01-01", status: "ENTREGUE" }));
    dbMocks.listarEquipamentosCliente.mockResolvedValue(os(200));
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    expect(await screen.findByRole("button", { name: "Ver todos (200+)" })).toBeInTheDocument();
  });

  it("Ver todos mostra o número exato abaixo do limite", async () => {
    mocks.clientes = [clienteSalvo()];
    dbMocks.listarEquipamentosCliente.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: i + 1, cliente_id: 7, marca: "Fluke", modelo: "87V", data_entrada: "2026-01-01", status: "ENTREGUE" })),
    );
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    expect(await screen.findByRole("button", { name: "Ver todos (5)" })).toBeInTheDocument();
  });

  it("abrir o cliente pelo nome mostra os contatos no painel e clicar de novo fecha", async () => {
    mocks.clientes = [clienteSalvo({ empresa_id: 3, contato_encontrado: "Carlos Mendes" })];
    dbMocks.listarClienteContatos.mockResolvedValue([
      { id: 1, empresa_id: 3, cliente_id: 7, nome: "Carlos Mendes", telefone: "71988887777", email: "carlos@x.com", ativo: true },
      { id: 2, empresa_id: 3, cliente_id: 7, nome: "Bruno Lima", ativo: true },
    ]);
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    expect(await screen.findByText("carlos@x.com")).toBeInTheDocument();
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    expect(dbMocks.listarClienteContatos).toHaveBeenCalledWith(7, 3);
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
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
    // Abrir o cliente no painel é clicar no nome dele na lista.
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    fireEvent.click(screen.getByRole("button", { name: "Bruno Lima" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    fireEvent.click(screen.getByRole("button", { name: "Bruno Lima" }));
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    expect(await screen.findByText("Nome antigo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /gerenciar acesso ao portal/i }));
    dbMocks.listarClienteContatos.mockResolvedValueOnce([
      { id: 1, empresa_id: 3, cliente_id: 7, nome: "Nome novo", ativo: true },
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "Fechar modal de contatos" }));
    expect(await screen.findByText("Nome novo")).toBeInTheDocument();
    expect(screen.queryByText("Nome antigo")).not.toBeInTheDocument();
  });

  it("clicar em um contato da lista abre o gerenciamento de contatos", async () => {
    mocks.clientes = [clienteSalvo({ empresa_id: 3 })];
    dbMocks.listarClienteContatos.mockResolvedValue([
      { id: 1, empresa_id: 3, cliente_id: 7, nome: "Carlos Mendes", email: "carlos@x.com", ativo: true },
    ]);
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: "Ana Souza" }));
    fireEvent.click(await screen.findByRole("button", { name: /Carlos Mendes/ }));
    expect(await screen.findByRole("button", { name: "Fechar modal de contatos" })).toBeInTheDocument();
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
