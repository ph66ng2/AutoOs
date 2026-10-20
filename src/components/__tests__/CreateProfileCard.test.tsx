import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateProfileCard } from "../CreateProfileCard";
const createProfileWithCode = vi.hoisted(() => vi.fn());
const successToast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: successToast } }));
vi.mock("@/lib/sensitive-access", () => ({
  SensitiveAccessService: { createProfileWithCode },
}));
const profiles = [
  {
    id: 1,
    nome: "Operador",
    role: "CUSTOM",
    permissions: [],
    pin_configured: true,
    is_default: false,
    ativo: true,
  },
];

describe("cadastro guiado de colaboradores", () => {
  beforeEach(() => createProfileWithCode.mockReset());
  it("impede duplicidade inclusive com caixa diferente", async () => {
    const user = userEvent.setup();
    render(<CreateProfileCard profiles={profiles} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText("Nome provisório"), "operador");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Já existe um perfil");
    expect(createProfileWithCode).not.toHaveBeenCalled();
  });
  it("permite recepção sem poderes sensíveis, só grava após revisar e mostra o código", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn().mockResolvedValue(undefined);
    createProfileWithCode.mockResolvedValue({
      profile_id: 9,
      nome: "Recepção 2",
      codigo: "K7Q-42M",
      expira_em: "2026-10-19T12:00:00Z",
    });
    render(<CreateProfileCard profiles={profiles} onCreated={onCreated} />);
    await user.type(screen.getByLabelText("Nome provisório"), "Recepção 2");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.queryByLabelText("PIN inicial")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByText("Nenhuma permissão sensível liberada."),
    ).toBeInTheDocument();
    expect(createProfileWithCode).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Criar e gerar código" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Informe seu PIN de administrador");
    expect(createProfileWithCode).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Seu PIN de administrador"), "4321");
    await user.click(screen.getByRole("button", { name: "Criar e gerar código" }));
    await waitFor(() =>
      expect(createProfileWithCode).toHaveBeenCalledWith(
        { nome: "Recepção 2", role: "ATENDENTE", permissions: [] },
        "4321",
      ),
    );
    expect(onCreated).toHaveBeenCalledOnce();
    expect(successToast).toHaveBeenCalledWith("Perfil Recepção 2 criado com sucesso.");
    expect(screen.getByRole("status")).toHaveTextContent("Perfil Recepção 2 criado");
    expect(screen.getByText("K7Q-42M")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Cadastrar outra pessoa" }),
    );
    expect(screen.getByLabelText("Nome provisório")).toHaveValue("");
  });
  it("preenche financeiro e converte em personalizado ao ajustar permissões", async () => {
    const user = userEvent.setup();
    render(<CreateProfileCard profiles={profiles} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText("Nome provisório"), "Paula");
    await user.click(screen.getByRole("radio", { name: /^Financeiro/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByRole("checkbox", { name: "Orçamentos e valores" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Consultar despesas" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Gerenciar equipe" }),
    ).not.toBeChecked();
    await user.click(
      screen.getByRole("checkbox", { name: "Consultar despesas" }),
    );
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByRole("radio", { name: /^Personalizado/ })).toBeChecked();
  });
});
