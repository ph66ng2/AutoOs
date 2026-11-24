import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SecurityProfile } from "@/types";

const { savePersonalization } = vi.hoisted(() => ({ savePersonalization: vi.fn() }));
vi.mock("@/lib/sensitive-access", () => ({ SensitiveAccessService: { savePersonalization } }));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ status: null }) }));
vi.mock("@/components/perfil/AppearancePicker", () => ({ AppearancePicker: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { Personalizar } from "./Perfil";

const perfil: SecurityProfile = {
  id: 3, nome: "Ana", role: "custom", permissions: [], pin_configured: true, is_default: false, ativo: true,
  email_profissional: "ana@empresa.com.br",
};

function montar() {
  const router = createMemoryRouter(
    [
      { path: "/perfil", element: <><Link to="/outra">Menu: outra tela</Link><Personalizar profile={perfil} onSaved={async () => undefined} /></> },
      { path: "/outra", element: <p>Outra tela</p> },
    ],
    { initialEntries: ["/perfil"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("Perfil › Personalizar: sair com alteração não salva", () => {
  beforeEach(() => {
    savePersonalization.mockReset();
    savePersonalization.mockResolvedValue({});
  });

  it("sem alteração, o menu sai direto", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByText("Menu: outra tela"));
    expect(screen.getByText("Outra tela")).toBeInTheDocument();
  });

  it("nome alterado: o menu pergunta; continuar mantém o texto", async () => {
    const user = userEvent.setup();
    const router = montar();
    await user.type(screen.getByLabelText("Nome de exibição"), " Paula");
    await user.click(screen.getByText("Menu: outra tela"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(router.state.location.pathname).toBe("/perfil");
    expect(screen.getByLabelText("Nome de exibição")).toHaveValue("Ana Paula");
  });

  it("depois de salvar, o menu sai sem perguntar", async () => {
    const user = userEvent.setup();
    montar();
    await user.type(screen.getByLabelText("Nome de exibição"), " Paula");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(savePersonalization).toHaveBeenCalledOnce());
    await user.click(screen.getByText("Menu: outra tela"));
    expect(await screen.findByText("Outra tela")).toBeInTheDocument();
  });
});
