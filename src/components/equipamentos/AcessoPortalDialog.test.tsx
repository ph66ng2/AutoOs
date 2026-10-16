import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AcessoPortalDialog, situacaoPortal } from "@/components/equipamentos/AcessoPortalDialog";
import type { Cliente, ClienteContato } from "@/types";

const mocks = vi.hoisted(() => ({
  buscarCliente: vi.fn(),
  listar: vi.fn(),
  definirAcesso: vi.fn(),
  definirSenha: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    buscarCliente: mocks.buscarCliente,
    listarClienteContatos: mocks.listar,
    definirAcessoPortalContato: mocks.definirAcesso,
    definirSenhaPortalContato: mocks.definirSenha,
    abrirUrl: vi.fn(),
  },
}));
// O painel de contatos tem testes próprios; aqui só importa entrar e voltar dele.
vi.mock("@/components/clientes/ClienteContatosPanel", () => ({
  ClienteContatosPanel: ({ cliente }: { cliente: Cliente }) => <p>Painel de contatos de {cliente.nome}</p>,
}));

const cliente = { id: 2, empresa_id: 1, nome: "Gráfica Exemplo", tipo_pessoa: "PJ", documento: "11222333000181" } as Cliente;
const ana: ClienteContato = { id: 5, empresa_id: 1, cliente_id: 2, nome: "Ana Souza", ativo: true, telefone: "71988887777", portal_acesso: "NENHUM" };
const bruno: ClienteContato = { id: 6, empresa_id: 1, cliente_id: 2, nome: "Bruno Lima", ativo: true, portal_acesso: "NENHUM" };

function abrir(responsavel?: number) {
  const onAlterado = vi.fn();
  render(<AcessoPortalDialog open onOpenChange={vi.fn()} clienteId={2} empresaId={1} responsavelContatoId={responsavel} onAlterado={onAlterado} />);
  return { onAlterado };
}

describe("AcessoPortalDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buscarCliente.mockResolvedValue(cliente);
    mocks.listar.mockResolvedValue([ana, bruno]);
  });

  it("marca o responsável, libera o acesso para responder e segue para a senha", async () => {
    mocks.definirAcesso.mockResolvedValue({ ...bruno, portal_acesso: "DECIDIR" });
    const { onAlterado } = abrir(6);
    expect(await screen.findByRole("radio", { name: /Bruno Lima/ })).toBeChecked();
    expect(screen.getByText("responsável pelo equipamento")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Liberar acesso e criar senha" }));
    await waitFor(() => expect(mocks.definirAcesso).toHaveBeenCalledWith(6, "DECIDIR"));
    expect(onAlterado).toHaveBeenCalled();
    expect(await screen.findByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByText(/11\.222\.333\/0001-81/, { selector: "strong" })).toBeInTheDocument();
  });

  it("desmarcar 'pode responder' libera só o acompanhamento", async () => {
    mocks.definirAcesso.mockResolvedValue({ ...ana, portal_acesso: "ACOMPANHAR" });
    abrir();
    await screen.findByRole("radio", { name: /Ana Souza/ });
    fireEvent.click(screen.getByRole("checkbox", { name: /Pode responder orçamentos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Liberar acesso e criar senha" }));
    await waitFor(() => expect(mocks.definirAcesso).toHaveBeenCalledWith(5, "ACOMPANHAR"));
  });

  it("contato que já responde com senha só oferece criar nova senha, sem mudar o acesso", async () => {
    mocks.listar.mockResolvedValue([{ ...ana, portal_acesso: "DECIDIR", portal_senha_definida_em: "2026-10-16T10:00:00Z" }]);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Criar nova senha" }));
    expect(await screen.findByLabelText("Senha")).toBeInTheDocument();
    expect(mocks.definirAcesso).not.toHaveBeenCalled();
  });

  it("vai aos contatos sem sair da janela e volta com o contato novo já marcado", async () => {
    abrir();
    await screen.findByRole("radio", { name: /Ana Souza/ });
    fireEvent.click(screen.getByRole("button", { name: /Cadastrar ou editar contatos/ }));
    expect(await screen.findByText("Painel de contatos de Gráfica Exemplo")).toBeInTheDocument();

    const carla: ClienteContato = { id: 9, empresa_id: 1, cliente_id: 2, nome: "Carla Dias", ativo: true, portal_acesso: "NENHUM" };
    mocks.listar.mockResolvedValue([ana, bruno, carla]);
    fireEvent.click(screen.getByRole("button", { name: /Voltar para o acesso ao portal/ }));
    expect(await screen.findByRole("radio", { name: /Carla Dias/ })).toBeChecked();
  });

  it("cliente sem contatos oferece cadastrar o primeiro", async () => {
    mocks.listar.mockResolvedValue([]);
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "Cadastrar contato" }));
    expect(await screen.findByText("Painel de contatos de Gráfica Exemplo")).toBeInTheDocument();
  });

  it("descreve a situação de cada contato no portal", () => {
    expect(situacaoPortal({ ...ana, portal_acesso: "DECIDIR" })).toBe("Pode responder · ainda sem senha");
    expect(situacaoPortal({ ...ana, portal_acesso: "DECIDIR", portal_senha_definida_em: "x" })).toBe("Pode responder · senha criada");
    expect(situacaoPortal(ana)).toBe("Sem acesso ao portal");
  });
});
