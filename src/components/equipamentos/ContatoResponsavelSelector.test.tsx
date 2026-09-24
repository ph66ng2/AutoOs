import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Cliente, ClienteContato } from "@/types";

const { listar, criar, mockError } = vi.hoisted(() => ({
  listar: vi.fn(),
  criar: vi.fn(),
  mockError: vi.fn(),
}));

vi.mock("@/lib/runtime-mode", () => ({ IS_SAAS_BUILD: true }));
vi.mock("@/lib/data/cliente-contatos-repository", () => ({
  carregarRepositorioClienteContatos: vi.fn(async () => ({ listar, criar })),
}));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ error: mockError }) }));

import { ContatoResponsavelSelector } from "@/components/equipamentos/ContatoResponsavelSelector";

const companyId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const contact: ClienteContato = {
  id: "33333333-3333-4333-8333-333333333333",
  empresa_id: companyId,
  cliente_id: clientId,
  nome: "Contato Online",
  email: "contato@example.test",
  telefone: "71912345678",
  ativo: true,
};

describe("ContatoResponsavelSelector SaaS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listar.mockResolvedValue([contact]);
    criar.mockImplementation(async (input: Partial<ClienteContato>) => ({
      ...contact,
      ...input,
      id: "44444444-4444-4444-8444-444444444444",
    }));
  });

  it("carrega e cria contatos por repositório Online usando o cliente UUID", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const client: Cliente = { id: clientId, empresa_id: companyId, nome: "Cliente Online", telefone: "71900000000" };
    render(<ContatoResponsavelSelector cliente={client} value={null} onChange={onChange} />);

    await waitFor(() => expect(listar).toHaveBeenCalledWith(clientId, companyId));
    await user.click(await screen.findByRole("button", { name: /Contato Online/ }));
    expect(onChange).toHaveBeenCalledWith(contact);

    await user.click(screen.getByRole("button", { name: /Novo contato/ }));
    await user.type(screen.getByLabelText("Nome *"), "Novo responsável");
    await user.type(screen.getByLabelText("E-mail"), "novo@example.test");
    await user.type(screen.getByLabelText("Telefone"), "71987654321");
    await user.click(screen.getByRole("button", { name: "Cadastrar e selecionar" }));

    await waitFor(() => expect(criar).toHaveBeenCalledWith(expect.objectContaining({
      empresa_id: companyId,
      cliente_id: clientId,
      nome: "Novo responsável",
      email: "novo@example.test",
      telefone: "71987654321",
    })));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "44444444-4444-4444-8444-444444444444" }));
  });

  it("preserva e exibe snapshots do contato enquanto a lista Online carrega", async () => {
    const snapshot: ClienteContato = { ...contact, nome: "Snapshot legado", ativo: undefined };
    listar.mockReturnValue(new Promise(() => undefined));
    const onChange = vi.fn();
    render(<ContatoResponsavelSelector
      cliente={{ id: clientId, empresa_id: companyId, nome: "Cliente Online" }}
      value={snapshot}
      onChange={onChange}
    />);

    await waitFor(() => expect(listar).toHaveBeenCalledWith(clientId, companyId));
    expect(screen.getByText("Snapshot legado")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
