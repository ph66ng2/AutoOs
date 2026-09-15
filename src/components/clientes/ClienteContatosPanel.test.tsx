import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ClienteContato } from "@/types";

const mockListar = vi.hoisted(() => vi.fn());
const mockCriar = vi.hoisted(() => vi.fn());
const mockAtualizar = vi.hoisted(() => vi.fn());
const mockInativar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    listarClienteContatos: mockListar,
    criarClienteContato: mockCriar,
    atualizarClienteContato: mockAtualizar,
    inativarClienteContato: mockInativar,
  },
}));

vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ success: vi.fn(), error: vi.fn() }),
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({ open, confirmLabel, onConfirm, onCancel }: any) => open ? (
    <div data-testid="confirm-contact">
      <button type="button" onClick={onCancel}>Cancelar</button>
      <button type="button" onClick={onConfirm}>{confirmLabel || "Confirmar"}</button>
    </div>
  ) : null,
}));

import { ClienteContatosPanel } from "@/components/clientes/ClienteContatosPanel";

const cliente = {
  id: 11,
  empresa_id: 7,
  tipo_pessoa: "PJ",
  nome: "Empresa Teste",
  razao_social: "Empresa Teste LTDA",
  telefone: "71999990000",
} as any;

const contato: ClienteContato = {
  id: 20,
  empresa_id: 7,
  cliente_id: 11,
  nome: "Ana",
  email: "ana@empresa.test",
  telefone: "71988880000",
  ativo: true,
};

describe("ClienteContatosPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListar.mockResolvedValue([contato]);
    mockCriar.mockResolvedValue({ ...contato, id: 21, nome: "Bruno" });
    mockAtualizar.mockResolvedValue({ ...contato, nome: "Ana Editada" });
    mockInativar.mockResolvedValue({ ...contato, ativo: false });
  });

  it("lista ativos, cadastra e edita contato sem perder o vínculo da empresa", async () => {
    render(<ClienteContatosPanel cliente={cliente} empresaId={7} />);
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Empresa Teste LTDA")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Bruno" } });
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "bruno@empresa.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(mockCriar).toHaveBeenCalledWith(expect.objectContaining({
      empresa_id: 7,
      cliente_id: 11,
      nome: "Bruno",
      email: "bruno@empresa.test",
    })));

    fireEvent.click(screen.getAllByRole("button", { name: /editar/i })[0]!);
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Ana Editada" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mockAtualizar).toHaveBeenCalledWith(20, expect.objectContaining({ nome: "Ana Editada" })));
  });

  it("confirma inativação e recarrega a lista ativa", async () => {
    render(<ClienteContatosPanel cliente={cliente} empresaId={7} />);
    await screen.findByText("Ana");
    fireEvent.click(screen.getByRole("button", { name: /inativar/i }));
    expect(screen.getByTestId("confirm-contact")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Inativar" })[1]!);
    await waitFor(() => expect(mockInativar).toHaveBeenCalledWith(20, 7));
    expect(mockListar).toHaveBeenCalledTimes(2);
  });
});
