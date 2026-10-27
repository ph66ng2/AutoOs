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
  it("com a trava 0.5.6, Recepção fica desabilitada com o motivo", () => {
    render(<CreateProfileCard profiles={profiles} onCreated={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /^Recepção/ })).toBeDisabled();
    expect(screen.getByText(/Indisponível até todos os computadores/)).toBeInTheDocument();
  });
  it("com a trava 0.5.6, não avança nem salva perfil sem permissão", async () => {
    const user = userEvent.setup();
    render(<CreateProfileCard profiles={profiles} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText("Nome provisório"), "Maria");
    await user.click(screen.getByRole("radio", { name: /^Personalizado/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("heading", { name: "Liberações" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("ao menos uma permissão");
    expect(createProfileWithCode).not.toHaveBeenCalled();
  });
  it("cria perfil Técnico compatível, só grava após revisar e mostra o código", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn().mockResolvedValue(undefined);
    createProfileWithCode.mockResolvedValue({
      profile_id: 9,
      nome: "Tec 2",
      codigo: "K7Q-42M",
      expira_em: "2026-10-19T12:00:00Z",
    });
    render(<CreateProfileCard profiles={profiles} onCreated={onCreated} />);
    await user.type(screen.getByLabelText("Nome provisório"), "Tec 2");
    await user.click(screen.getByRole("radio", { name: /^Técnico/ }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(createProfileWithCode).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Criar e gerar código" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Informe seu PIN de administrador");
    await user.type(screen.getByLabelText("Seu PIN de administrador"), "4321");
    await user.click(screen.getByRole("button", { name: "Criar e gerar código" }));
    await waitFor(() =>
      expect(createProfileWithCode).toHaveBeenCalledWith(
        { nome: "Tec 2", role: "TECNICO", permissions: ["STOCK_CONTROL"] },
        "4321",
      ),
    );
    expect(onCreated).toHaveBeenCalledOnce();
    expect(screen.getByText("K7Q-42M")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cadastrar outra pessoa" }));
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
