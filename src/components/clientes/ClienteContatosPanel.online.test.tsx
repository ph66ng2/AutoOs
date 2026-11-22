import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { listar, criar, tauriListar } = vi.hoisted(() => ({ listar: vi.fn(), criar: vi.fn(), tauriListar: vi.fn() }));

vi.mock("@/lib/runtime-mode", () => ({ IS_SAAS_BUILD: true }));
vi.mock("@/lib/data/cliente-contatos-repository", () => ({
  carregarRepositorioClienteContatos: async () => ({ listar, criar, atualizar: vi.fn(), inativar: vi.fn() }),
}));
vi.mock("@/lib/db", () => ({ db: { listarClienteContatos: tauriListar } }));
vi.mock("@/hooks/useNotification", () => ({ useNotification: () => ({ success: vi.fn(), error: vi.fn() }) }));

import { ClienteContatosPanel } from "@/components/clientes/ClienteContatosPanel";

const clientId = "22222222-2222-4222-8222-222222222222";

describe("ClienteContatosPanel no SaaS", () => {
  it("aceita UUID, usa o repository Online e nunca chama o Tauri", async () => {
    listar.mockResolvedValue([]);
    criar.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" });
    render(<ClienteContatosPanel cliente={{ id: clientId, nome: "Ana", telefone: "" }} />);

    await waitFor(() => expect(listar).toHaveBeenCalledWith(clientId, undefined));
    fireEvent.click(screen.getByRole("button", { name: /novo contato/i }));
    fireEvent.change(screen.getByLabelText("Nome *"), { target: { value: "Bruno" } });
    fireEvent.click(screen.getByRole("button", { name: "Cadastrar" }));

    await waitFor(() => expect(criar).toHaveBeenCalledWith(expect.objectContaining({ cliente_id: clientId, nome: "Bruno" })));
    expect(tauriListar).not.toHaveBeenCalled();
  });
});
