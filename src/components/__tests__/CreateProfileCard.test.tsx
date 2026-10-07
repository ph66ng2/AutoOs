import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateProfileCard } from "../CreateProfileCard";

const createProfile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sensitive-access", () => ({ SensitiveAccessService: { createProfile } }));

const profiles = [{ id: 1, nome: "Operador", role: "CUSTOM", permissions: [], pin_configured: true, is_default: false, ativo: true }];

describe("criação de perfil na aba Perfil", () => {
  beforeEach(() => createProfile.mockReset());

  it("mostra nome duplicado antes de chamar o backend", async () => {
    const user = userEvent.setup();
    render(<CreateProfileCard profiles={profiles} onCreated={vi.fn()} />);
    await user.type(screen.getByLabelText("Nome do perfil"), "operador");
    await user.click(screen.getByRole("button", { name: "Criar perfil" }));
    expect(screen.getByText("Já existe um perfil com este nome. Escolha outro nome.")).toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
  });

  it("cria apenas quando nome, permissão e os dois PINs são válidos", async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn().mockResolvedValue(undefined);
    createProfile.mockResolvedValue({});
    render(<CreateProfileCard profiles={profiles} onCreated={onCreated} />);
    await user.type(screen.getByLabelText("Nome do perfil"), "Técnico");
    await user.click(screen.getByLabelText("movimentar e editar estoque"));
    await user.type(screen.getByLabelText("PIN inicial"), "1234");
    await user.type(screen.getByLabelText("Confirmar PIN"), "4321");
    await user.click(screen.getByRole("button", { name: "Criar perfil" }));
    expect(screen.getByText("Os PINs não conferem.")).toBeInTheDocument();
    expect(createProfile).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("Confirmar PIN"));
    await user.type(screen.getByLabelText("Confirmar PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Criar perfil" }));
    await waitFor(() => expect(createProfile).toHaveBeenCalledWith({ nome: "Técnico", role: "CUSTOM", permissions: ["STOCK_CONTROL"] }, "1234"));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(screen.getByRole("status")).toHaveTextContent("Perfil Técnico criado");
  });
});
