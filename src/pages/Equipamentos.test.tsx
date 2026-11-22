import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Equipamentos from "./Equipamentos";

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: () => {} });

const { dbMocks, status, enviarOrcamento, recarregar } = vi.hoisted(() => ({
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
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ status, hasPermission: () => true, ensureSensitiveAccess: async () => true }),
}));
vi.mock("@/hooks/useEquipamentos", () => {
  const equipamentos = [];
  return { useEquipamentos: () => ({ equipamentos, total: 0, contagens: {}, destaques: new Set(), recarregar }) };
});
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
