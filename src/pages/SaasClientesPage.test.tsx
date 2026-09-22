import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SaasClientesPage from "@/pages/SaasClientesPage";

const { criarMock } = vi.hoisted(() => ({ criarMock: vi.fn() }));

vi.mock("@/hooks/useClientes", () => ({
  useClientes: () => ({
    clientes: [],
    loading: false,
    error: null,
    criar: criarMock,
    atualizar: vi.fn(),
    deletar: vi.fn(),
    recarregar: vi.fn(),
  }),
}));

describe("SaasClientesPage — retorno ao salvar", () => {
  beforeEach(() => criarMock.mockReset());

  it("mostra no modal por que um formulário inválido não foi enviado", async () => {
    const user = userEvent.setup();
    render(<SaasClientesPage />);

    await user.click(screen.getByRole("button", { name: "Novo cliente" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Revise o formulário");
    expect(alert).toHaveTextContent("CPF ou CNPJ");
    expect(criarMock).not.toHaveBeenCalled();
  });

  it("mostra no modal uma falha de gravação online após validar os campos", async () => {
    criarMock.mockResolvedValue({ sucesso: false, erro: "O serviço Online recusou o cadastro." });
    const user = userEvent.setup();
    render(<SaasClientesPage />);

    await user.click(screen.getByRole("button", { name: "Novo cliente" }));
    await user.type(screen.getByLabelText("CPF ou CNPJ *"), "57522734000158");
    await user.type(await screen.findByPlaceholderText("Razão Social da empresa"), "Empresa Teste");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Falha ao salvar online");
    expect(alert).toHaveTextContent("O serviço Online recusou o cadastro.");
    expect(criarMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
