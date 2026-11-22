import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Equipamentos from "./Equipamentos";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} });

const { dbMocks, status, enviarOrcamento, recarregar, toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), {
    error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), message: vi.fn(),
    loading: vi.fn(), dismiss: vi.fn(), promise: vi.fn(),
  }),
  dbMocks: {
    buscarEquipamento: vi.fn(),
    obterDestinatarioOrcamento: vi.fn(),
    salvarVerificacao: vi.fn(),
    buscarCliente: vi.fn(),
    listarClienteContatos: vi.fn(),
    listarEquipamentosCliente: vi.fn(),
    buscarVerificacao: vi.fn(),
    listarComunicacoes: vi.fn(),
    listarImagensEquipamento: vi.fn(),
    listarHistoricoEquipamento: vi.fn(),
  },
  enviarOrcamento: vi.fn(),
  recarregar: vi.fn(),
  status: { unlocked: true, active_profile_id: 1, active_empresa_id: 4, profiles: [] },
}));
vi.mock("@/lib/db", () => ({ db: dbMocks }));
vi.mock("sonner", async (importOriginal) => ({
  ...await importOriginal<typeof import("sonner")>(),
  toast: toastMock,
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ status, hasPermission: () => true, ensureSensitiveAccess: async () => true }),
}));
vi.mock("@/hooks/useEquipamentos", () => {
  const equipamentos = [];
  return { useEquipamentos: () => ({ equipamentos, total: 0, contagens: {}, destaques: new Set(), recarregar }) };
});
vi.mock("@/lib/equipamento-imagem-utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/equipamento-imagem-utils")>(),
  arquivoParaImagemEquipamento: async (arquivo: File, ordem: number, categoria: string) => ({
    nome_arquivo: arquivo.name, mime_type: "image/jpeg", data_url: "data:image/jpeg;base64,AA==",
    categoria, ordem, legenda: "",
  }),
}));
vi.mock("@/pages/equipamentos/EquipamentosPageGallery", () => ({
  GaleriaImagensEquipamento: ({ imagens }: { imagens: { nome_arquivo: string }[] }) => (
    <ul aria-label="Fotos da entrada">{imagens.map((imagem) => <li key={imagem.nome_arquivo}>{imagem.nome_arquivo}</li>)}</ul>
  ),
}));
vi.mock("@/hooks/useTecnicos", () => ({ useTecnicos: () => [], useNomesFiltroTecnico: () => [] }));
vi.mock("@/hooks/useAtualizacaoAoVivo", () => ({ useAtualizacaoAoVivo: () => {} }));

vi.mock("@/lib/envio-orcamento", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/envio-orcamento")>(),
  enviarOrcamentoAoCliente: enviarOrcamento,
}));
vi.mock("@/components/equipamentos/VerificacaoTecnica", () => ({
  VerificacaoTecnica: ({ open, onConcluir }) => open && (
    <button onClick={() => void onConcluir({ custo_total: 150 })}>Finalizar verificação</button>
  ),
}));

function RotaDeTeste() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <>
      <output>{pathname}</output>
      <button onClick={() => navigate("/equipamentos/2")}>Abrir B</button>
      <button onClick={() => navigate("/equipamentos/nova")}>Ir para entrada</button>
      <Equipamentos />
    </>
  );
}

function abrir(rota = "/equipamentos/1") {
  return render(<MemoryRouter initialEntries={[rota]}><RotaDeTeste /></MemoryRouter>);
}

function os(id: number) {
  return { id, marca: "Marca", modelo: `Modelo ${id}`, status: "RECEBIDO", serial_number: `S-${id}` };
}

function buscaPendente() {
  let resolver!: (eq: ReturnType<typeof os>) => void;
  let rejeitar!: (erro: Error) => void;
  dbMocks.buscarEquipamento.mockImplementationOnce(() => new Promise((resolve, reject) => {
    resolver = resolve;
    rejeitar = reject;
  }));
  return { resolver: (eq: ReturnType<typeof os>) => resolver(eq), rejeitar: (erro: Error) => rejeitar(erro) };
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(status, { unlocked: true, active_profile_id: 1, active_empresa_id: 4 });
  recarregar.mockResolvedValue({ status: "atualizado" });
  dbMocks.buscarVerificacao.mockResolvedValue(null);
  dbMocks.listarComunicacoes.mockResolvedValue([]);
  dbMocks.listarEquipamentosCliente.mockResolvedValue([]);
  dbMocks.listarImagensEquipamento.mockResolvedValue([]);
  dbMocks.listarHistoricoEquipamento.mockResolvedValue([]);
});

describe("abertura dos detalhes pela rota", () => {
  it("mantém a OS B quando a resposta da OS A chega depois", async () => {
    const a = buscaPendente();
    dbMocks.buscarEquipamento.mockResolvedValueOnce(os(2));
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Abrir B" }));
    expect(await screen.findByRole("heading", { name: "Marca Modelo 2" })).toBeInTheDocument();
    await act(async () => { a.resolver(os(1)); });
    expect(screen.getByText("/equipamentos/2")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Marca Modelo 2" })).toBeInTheDocument();
    expect(dbMocks.buscarVerificacao).not.toHaveBeenCalledWith(1);
  });

  it.each(["resposta", "erro"])("mantém Nova entrada após %s tardio da OS A", async (resultado) => {
    const a = buscaPendente();
    abrir();
    fireEvent.click(screen.getByRole("button", { name: "Ir para entrada" }));
    expect(await screen.findByRole("heading", { name: "Nova entrada" })).toBeInTheDocument();
    await act(async () => {
      if (resultado === "resposta") a.resolver(os(1));
      else a.rejeitar(new Error("Falha na busca de A"));
    });
    expect(screen.getByText("/equipamentos/nova")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nova entrada" })).toBeInTheDocument();
    expect(dbMocks.buscarVerificacao).not.toHaveBeenCalledWith(1);
  });
});

describe("rascunho da Nova entrada", () => {
  const chave = "autoos:rascunho:nova-entrada:4:1";
  const defeito = "Anotação do rascunho";
  const campoDefeito = () => screen.getByPlaceholderText("Defeito informado no recebimento");

  function gravarRascunho(chaveLocal = chave) {
    localStorage.setItem(chaveLocal, JSON.stringify({
      salvoEm: new Date().toISOString(),
      dados: { form: { defeito_relatado: defeito }, clienteId: 8, responsavelId: 9 },
    }));
  }

  it.each([
    { active_empresa_id: 12 },
    { active_profile_id: 2 },
    { unlocked: false },
    { active_empresa_id: null },
  ])("não recupera o rascunho com sessão %j", (sessao) => {
    gravarRascunho();
    Object.assign(status, sessao);
    abrir("/equipamentos/nova");
    expect(campoDefeito()).toHaveValue("");
    expect(dbMocks.buscarCliente).not.toHaveBeenCalled();
    expect(localStorage.getItem(chave)).not.toBeNull();
  });

  it("remove a chave legada e ignora seu conteúdo", () => {
    const legada = "autoos:rascunho:nova-entrada";
    gravarRascunho(legada);
    abrir("/equipamentos/nova");
    expect(campoDefeito()).toHaveValue("");
    expect(localStorage.getItem(legada)).toBeNull();
  });

  it("recupera os vínculos atuais e persiste somente seus IDs", async () => {
    gravarRascunho();
    dbMocks.buscarCliente.mockResolvedValue({ id: 8, empresa_id: 4, ativo: true, nome: "Cliente atual" });
    dbMocks.listarClienteContatos.mockResolvedValue([
      { id: 9, cliente_id: 8, empresa_id: 4, ativo: true, nome: "Contato atual" },
    ]);
    abrir("/equipamentos/nova");
    expect(campoDefeito()).toHaveValue(defeito);
    expect(await screen.findByText("Cliente atual")).toBeInTheDocument();
    expect(await screen.findByText("Contato atual")).toBeInTheDocument();
    expect(dbMocks.buscarCliente).toHaveBeenCalledWith(8);
    expect(dbMocks.listarClienteContatos).toHaveBeenCalledWith(8, 4);
    act(() => window.dispatchEvent(new Event("pagehide")));
    const { dados } = JSON.parse(localStorage.getItem(chave)!);
    expect(dados).toMatchObject({ clienteId: 8, responsavelId: 9 });
    expect(JSON.stringify(dados)).not.toMatch(/Cliente atual|Contato atual/);
  });

  it("descarta o vínculo quando o cliente consultado pertence a outra empresa", async () => {
    gravarRascunho();
    dbMocks.buscarCliente.mockResolvedValue({ id: 8, empresa_id: 12, ativo: true, nome: "Cliente externo" });
    abrir("/equipamentos/nova");
    await act(async () => {});
    expect(campoDefeito()).toHaveValue(defeito);
    expect(screen.queryByText("Cliente externo")).not.toBeInTheDocument();
    expect(dbMocks.listarClienteContatos).not.toHaveBeenCalled();
  });

  it.each([
    { caso: "com texto", form: { defeito_relatado: defeito } },
    { caso: "só com o cliente", form: {} },
  ])("Desfazer o Cancelar preserva o cliente e o contato ainda carregando ($caso)", async ({ form }) => {
    localStorage.setItem(chave, JSON.stringify({
      salvoEm: new Date().toISOString(),
      dados: { form, clienteId: 8, responsavelId: 9 },
    }));
    dbMocks.buscarCliente.mockReturnValue(new Promise(() => {}));
    abrir("/equipamentos/nova");
    await waitFor(() => expect(dbMocks.buscarCliente).toHaveBeenCalledWith(8));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(localStorage.getItem(chave)).toBeNull();
    const chamada = toastMock.mock.calls.find(([titulo]) => titulo === "Entrada descartada");
    expect(chamada).toBeDefined();
    act(() => chamada![1].action.onClick());
    const { dados } = JSON.parse(localStorage.getItem(chave)!);
    expect(dados).toMatchObject({ clienteId: 8, responsavelId: 9 });
  });

  it.each([
    { caso: "bloqueio por inatividade", sessao: { unlocked: false } },
    { caso: "empresa indisponível por erro passageiro", sessao: { active_empresa_id: null } },
  ])("mantém texto e fotos da Nova entrada aberta no $caso", async ({ sessao }) => {
    const { container, rerender } = abrir("/equipamentos/nova");
    const novaRota = () => rerender(<MemoryRouter initialEntries={["/equipamentos/nova"]}><RotaDeTeste /></MemoryRouter>);
    fireEvent.change(campoDefeito(), { target: { value: "Não liga" } });
    const entrada = container.querySelector<HTMLInputElement>("#equipamento-imagens-entrada")!;
    fireEvent.change(entrada, { target: { files: [new File(["x"], "frente.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByText("frente.jpg")).toBeInTheDocument();

    Object.assign(status, sessao);
    novaRota();
    expect(campoDefeito()).toHaveValue("Não liga");
    expect(screen.getByText("frente.jpg")).toBeInTheDocument();

    Object.assign(status, { unlocked: true, active_profile_id: 1, active_empresa_id: 4 });
    novaRota();
    expect(campoDefeito()).toHaveValue("Não liga");
    expect(screen.getByText("frente.jpg")).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem(chave)!).dados.form.defeito_relatado).toBe("Não liga"));
  });

  it("aberta sem chave, recupera o rascunho da chave que chega com o formulário vazio", async () => {
    gravarRascunho();
    dbMocks.buscarCliente.mockReturnValue(new Promise(() => {}));
    Object.assign(status, { active_empresa_id: null });
    const { rerender } = abrir("/equipamentos/nova");
    expect(campoDefeito()).toHaveValue("");

    Object.assign(status, { active_empresa_id: 4 });
    rerender(<MemoryRouter initialEntries={["/equipamentos/nova"]}><RotaDeTeste /></MemoryRouter>);
    expect(campoDefeito()).toHaveValue(defeito);
    await waitFor(() => expect(dbMocks.buscarCliente).toHaveBeenCalledWith(8));
    act(() => window.dispatchEvent(new Event("pagehide")));
    const { dados } = JSON.parse(localStorage.getItem(chave)!);
    expect(dados).toMatchObject({ form: { defeito_relatado: defeito }, clienteId: 8, responsavelId: 9 });
  });

  it("aberta sem chave e já preenchida, oferece o rascunho da chave que chega", async () => {
    gravarRascunho();
    Object.assign(status, { active_empresa_id: null });
    const { rerender } = abrir("/equipamentos/nova");
    fireEvent.change(campoDefeito(), { target: { value: "Não liga" } });

    Object.assign(status, { active_empresa_id: 4 });
    rerender(<MemoryRouter initialEntries={["/equipamentos/nova"]}><RotaDeTeste /></MemoryRouter>);
    expect(campoDefeito()).toHaveValue("Não liga");
    const chamada = toastMock.mock.calls.find(([titulo]) => titulo === "Havia outra entrada em rascunho");
    expect(chamada).toBeDefined();
    act(() => chamada![1].action.onClick());
    expect(campoDefeito()).toHaveValue(defeito);
  });

  it("limpa os dados exibidos quando o perfil muda com o formulário aberto", async () => {
    gravarRascunho();
    const { rerender } = abrir("/equipamentos/nova");
    expect(campoDefeito()).toHaveValue(defeito);
    status.active_profile_id = 2;
    rerender(<MemoryRouter initialEntries={["/equipamentos/nova"]}><RotaDeTeste /></MemoryRouter>);
    expect(campoDefeito()).toHaveValue("");
    expect(localStorage.getItem("autoos:rascunho:nova-entrada:4:2")).toBeNull();
    expect(localStorage.getItem(chave)).not.toBeNull();
  });
});

it("volta à OS salva e permite enviar o orçamento quando a recarga falha", async () => {
  const anterior = { ...os(1), status: "EM_VERIFICACAO" };
  const salvo = {
    ...anterior,
    status: "AGUARDANDO_APROVACAO",
    cliente_nome: "Cliente da OS",
    cliente_telefone: "71999999999",
    valor_orcamento: 150,
    prazo_aprovacao: "2099-12-31",
  };
  const verificacao = { equipamento_id: 1, tecnico_nome: "Técnico", custo_total: 150 };
  dbMocks.buscarEquipamento.mockResolvedValueOnce(anterior).mockRejectedValue(new Error("OS indisponível"));
  dbMocks.buscarVerificacao.mockRejectedValue(new Error("Consulta da verificação indisponível"));
  dbMocks.obterDestinatarioOrcamento.mockResolvedValue({ precisaContato: false });
  dbMocks.salvarVerificacao.mockResolvedValue({ equipamento: salvo, verificacao });
  recarregar.mockResolvedValue({ status: "falhou" });
  enviarOrcamento.mockRejectedValueOnce(new Error("Provedor indisponível")).mockResolvedValue({
    canais: { whatsapp: { enviado: true }, email: { enviado: false } },
    avisos: [],
  });

  abrir("/equipamentos/1/verificacao");
  fireEvent.click(await screen.findByRole("button", { name: "Finalizar verificação" }));

  expect(await screen.findByText("/equipamentos/1")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Aprovar" })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Mais ações" }), { key: "ArrowDown" });
  fireEvent.keyDown(await screen.findByRole("option", { name: "WhatsApp" }), { key: "Enter" });

  await waitFor(() => expect(enviarOrcamento).toHaveBeenNthCalledWith(
    2, salvo, verificacao, { reenvioManual: true, enviarEmail: false },
  ));
  expect(dbMocks.salvarVerificacao).toHaveBeenCalledTimes(1);
  expect(dbMocks.buscarEquipamento).toHaveBeenCalledTimes(2);
});
