import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Cliente, ClienteContato } from "@/types";

const { listar, criar, showError } = vi.hoisted(() => ({
  listar: vi.fn(),
  criar: vi.fn(),
  showError: vi.fn(),
}));

vi.mock("@/lib/runtime-mode", () => ({ IS_SAAS_BUILD: false }));
vi.mock("@/lib/db", () => ({
  db: {
    listarClienteContatos: listar,
    criarClienteContato: criar,
  },
}));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ error: showError }) }));

import { ContatoResponsavelSelector } from "@/components/equipamentos/ContatoResponsavelSelector";

const clienteA: Cliente = { id: 11, empresa_id: 7, nome: "Cliente A" };
const clienteB: Cliente = { id: 12, empresa_id: 7, nome: "Cliente B" };
const contato: ClienteContato = {
  id: 20,
  empresa_id: 7,
  cliente_id: 11,
  nome: "Ana",
  email: "ana@example.test",
  telefone: "71988880000",
  ativo: true,
};

describe("ContatoResponsavelSelector Tauri", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listar.mockResolvedValue([contato]);
    criar.mockResolvedValue({ ...contato, id: 21, nome: "Bruno" });
  });

  it("mantém listagem local por IDs numéricos e limpa o responsável ao trocar de cliente", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const view = render(
      <ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={null} onChange={onChange} />,
    );

    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(listar).toHaveBeenCalledWith(11, 7);
    await user.click(screen.getByRole("button", { name: /Ana/ }));
    expect(onChange).toHaveBeenLastCalledWith(contato);

    view.rerender(<ContatoResponsavelSelector cliente={clienteB} empresaId={7} value={contato} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(null));
    await waitFor(() => expect(listar).toHaveBeenLastCalledWith(12, 7));
  });

  it("cadastra um contato local com tenant numérico e seleciona o resultado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Novo contato/ }));
    await user.type(screen.getByLabelText("Nome *"), "Bruno");
    await user.click(screen.getByRole("button", { name: "Cadastrar e selecionar" }));

    await waitFor(() => expect(criar).toHaveBeenCalledWith(expect.objectContaining({
      empresa_id: 7,
      cliente_id: 11,
      nome: "Bruno",
    })));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 21, nome: "Bruno" }));
  });

  it("pré-seleciona o contato uma única vez quando preSelecionar está ativo", async () => {
    const onChange = vi.fn();
    render(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={null} onChange={onChange} preSelecionar />);
    await screen.findByText("Ana");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(contato));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("não pré-seleciona de novo depois de remover o responsável", async () => {
    const onChange = vi.fn();
    const view = render(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={null} onChange={onChange} preSelecionar />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(contato));

    view.rerender(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={contato} onChange={onChange} preSelecionar />);
    fireEvent.click(await screen.findByRole("button", { name: /remover responsável/i }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    view.rerender(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={null} onChange={onChange} preSelecionar />);

    await screen.findByText("Ana");
    expect(onChange.mock.calls.filter(([arg]) => arg === contato)).toHaveLength(1);
  });

  it("não pré-seleciona quando value já existe", async () => {
    const onChange = vi.fn();
    const outro = { ...contato, id: 99, nome: "Outro", telefone: "11977776666" };
    render(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={outro} onChange={onChange} preSelecionar />);
    await screen.findByText("Outro");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("ignora contato inativo ou sem celular válido", async () => {
    const onChange = vi.fn();
    const inativo = { ...contato, id: 22, nome: "Inativo", telefone: "11977776666", ativo: false };
    const semCelular = { ...contato, id: 23, nome: "Sem celular", telefone: "123" };
    listar.mockResolvedValue([inativo, semCelular, contato]);
    render(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={null} onChange={onChange} preSelecionar />);
    await screen.findByText("Ana");
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(contato));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("sem preSelecionar não seleciona nada", async () => {
    const onChange = vi.fn();
    render(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={null} onChange={onChange} />);
    await screen.findByText("Ana");
    expect(onChange).not.toHaveBeenCalled();
  });
});
