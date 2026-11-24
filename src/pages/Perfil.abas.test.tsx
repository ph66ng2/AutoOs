import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SecurityProfile } from "@/types";

const m = vi.hoisted(() => ({ openProfileSelector: vi.fn(), savePersonalization: vi.fn() }));
const perfil: SecurityProfile = {
  id: 3, nome: "Ana", role: "custom", permissions: [], pin_configured: true, is_default: false, ativo: true,
  email_profissional: "ana@empresa.com.br",
};
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({
    status: { unlocked: true, active_profile_id: 3, active_role: "custom", profiles: [perfil], permissions: [] },
    openProfileSelector: m.openProfileSelector,
    refreshStatus: vi.fn(async () => undefined),
  }),
}));
vi.mock("@/lib/sensitive-access", () => ({
  SensitiveAccessService: { savePersonalization: m.savePersonalization, listMyActivity: vi.fn(async () => []), configurePin: vi.fn() },
}));
vi.mock("@/components/perfil/AppearancePicker", () => ({ AppearancePicker: () => null }));
vi.mock("@/components/perfil/PreferenciasNotificacao", () => ({ PreferenciasNotificacao: () => <p>Preferências de avisos</p> }));
vi.mock("@/components/busca/AjudaAtalhos", () => ({ ListaAtalhos: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Perfil from "./Perfil";

function montar() {
  const router = createMemoryRouter(
    [
      { path: "/perfil", element: <><Link to="/outra">Menu: outra tela</Link><Perfil /></> },
      { path: "/outra", element: <p>Outra tela</p> },
    ],
    { initialEntries: ["/perfil"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("Perfil: trocar de aba com alteração não salva", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.savePersonalization.mockResolvedValue({});
    m.openProfileSelector.mockResolvedValue(false);
  });

  it("sem alteração, trocar de aba não pergunta", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("tab", { name: "Personalizar" }));
    expect(screen.getByLabelText("Nome de exibição")).toHaveValue("Ana");
    await user.click(screen.getByRole("tab", { name: "Notificações" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Preferências de avisos")).toBeInTheDocument();
  });

  it("nome alterado: trocar de aba pergunta; continuar mantém, sair descarta", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("tab", { name: "Personalizar" }));
    await user.type(screen.getByLabelText("Nome de exibição"), " Paula");

    await user.click(screen.getByRole("tab", { name: "Notificações" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Personalizar" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Nome de exibição")).toHaveValue("Ana Paula");

    await user.click(screen.getByRole("tab", { name: "Notificações" }));
    await user.click(await screen.findByRole("button", { name: "Sair sem salvar" }));
    expect(await screen.findByText("Preferências de avisos")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Personalizar" }));
    expect(screen.getByLabelText("Nome de exibição")).toHaveValue("Ana");
  });

  it("nome alterado: o menu e Trocar de perfil perguntam (um único aviso)", async () => {
    const user = userEvent.setup();
    const router = montar();
    await user.click(screen.getByRole("tab", { name: "Personalizar" }));
    await user.type(screen.getByLabelText("Nome de exibição"), " Paula");

    await user.click(screen.getByText("Menu: outra tela"));
    expect(await screen.findAllByRole("alertdialog")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(router.state.location.pathname).toBe("/perfil");

    await user.click(screen.getByRole("button", { name: /trocar de perfil/i }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    expect(m.openProfileSelector).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(m.openProfileSelector).toHaveBeenCalledOnce();
  });

  it("depois de salvar, trocar de aba não pergunta", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("tab", { name: "Personalizar" }));
    await user.type(screen.getByLabelText("Nome de exibição"), " Paula");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(m.savePersonalization).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("tab", { name: "Notificações" }));
    expect(await screen.findByText("Preferências de avisos")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
