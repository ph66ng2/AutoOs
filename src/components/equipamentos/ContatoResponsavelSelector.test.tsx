import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Cliente, ClienteContato } from "@/types";

const mockListar = vi.hoisted(() => vi.fn());
const mockCriar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    listarClienteContatos: mockListar,
    criarClienteContato: mockCriar,
  },
}));

vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ error: vi.fn() }),
}));

import { ContatoResponsavelSelector } from "@/components/equipamentos/ContatoResponsavelSelector";

const clienteA = { id: 11, empresa_id: 7, nome: "Empresa A" } as Cliente;
const clienteB = { id: 12, empresa_id: 7, nome: "Empresa B" } as Cliente;
const contatoA: ClienteContato = {
  id: 20,
  empresa_id: 7,
  cliente_id: 11,
  nome: "Ana",
  email: "ana@empresa.test",
  telefone: "71988880000",
  ativo: true,
};

describe("ContatoResponsavelSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListar.mockResolvedValue([contatoA]);
    mockCriar.mockResolvedValue({
      ...contatoA,
      id: 21,
      cliente_id: 11,
      nome: "Bruno",
      email: "bruno@empresa.test",
    });
  });

  it("cadastra rapidamente e seleciona o novo contato", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={null} onChange={onChange} />);

    await user.click(await screen.findByRole("button", { name: /novo contato/i }));
    await user.type(screen.getByLabelText("Nome *"), "Bruno");
    await user.type(screen.getByLabelText("E-mail"), "bruno@empresa.test");
    await user.click(screen.getByRole("button", { name: /cadastrar e selecionar/i }));

    await waitFor(() => expect(mockCriar).toHaveBeenCalledWith(expect.objectContaining({
      empresa_id: 7,
      cliente_id: 11,
      nome: "Bruno",
      email: "bruno@empresa.test",
    })));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ nome: "Bruno" }));
  });

  it("limpa o responsável quando o cliente é trocado", async () => {
    const onChange = vi.fn();
    const view = render(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={contatoA} onChange={onChange} />);
    expect(await screen.findByText("Ana")).toBeInTheDocument();

    view.rerender(<ContatoResponsavelSelector cliente={clienteB} empresaId={7} value={contatoA} onChange={onChange} />);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(mockListar).toHaveBeenLastCalledWith(12, 7);
  });

  it("oferece ficar sem responsável específico", async () => {
    const onChange = vi.fn();
    render(<ContatoResponsavelSelector cliente={clienteA} empresaId={7} value={contatoA} onChange={onChange} />);
    await screen.findByText("Ana");
    fireEvent.click(screen.getByRole("button", { name: /remover responsável/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
