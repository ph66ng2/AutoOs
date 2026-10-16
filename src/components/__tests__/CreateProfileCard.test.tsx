import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateProfileCard } from "../CreateProfileCard";
const createProfile = vi.hoisted(() => vi.fn());
const successToast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: successToast } }));
vi.mock("@/lib/sensitive-access", () => ({
  SensitiveAccessService: { createProfile },
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
  beforeEach(() => createProfile.mockReset());
  it("impede duplicidade inclusive com caixa diferente", async () => {
    const user = userEvent.setup();
    render(<CreateProfileCard profiles={profiles} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText("Nome do colaborador"), "operador");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Já existe um perfil");
    expect(createProfile).not.toHaveBeenCalled();
  });
  it("permite recepção sem poderes sensíveis e só grava após revisar", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn().mockResolvedValue(undefined);
    createProfile.mockResolvedValue({});
    render(<CreateProfileCard profiles={profiles} onCreated={onCreated} />);
    await user.type(
      screen.getByLabelText("Nome do colaborador"),
      "Maria Santos",
    );
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.type(screen.getByLabelText("PIN inicial"), "1234");
    await user.type(screen.getByLabelText("Confirmar PIN"), "4321");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Os PINs não conferem");
    await user.clear(screen.getByLabelText("Confirmar PIN"));
    await user.type(screen.getByLabelText("Confirmar PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      screen.getByText("Nenhuma permissão sensível liberada."),
    ).toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Criar perfil" }));
    await waitFor(() =>
      expect(createProfile).toHaveBeenCalledWith(
        { nome: "Maria Santos", role: "ATENDENTE", permissions: [] },
        "1234",
      ),
    );
    expect(onCreated).toHaveBeenCalledOnce();
    expect(successToast).toHaveBeenCalledWith("Perfil Maria Santos criado com sucesso.");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Perfil Maria Santos criado",
    );
    await user.click(
      screen.getByRole("button", { name: "Cadastrar outra pessoa" }),
    );
    expect(screen.getByLabelText("Nome do colaborador")).toHaveValue("");
  });
  it("preenche financeiro e converte em personalizado ao ajustar permissões", async () => {
    const user = userEvent.setup();
    render(<CreateProfileCard profiles={profiles} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText("Nome do colaborador"), "Paula");
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
