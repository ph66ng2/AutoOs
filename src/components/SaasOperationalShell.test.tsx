import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaasOperationalShell } from "@/components/SaasOperationalShell";
import type { SaasSession } from "@/types/saas-auth";

vi.mock("@/pages/SaasClientesPage", () => ({
  default: () => <h1>Clientes Online</h1>,
}));

const session: SaasSession = {
  accessToken: "access", refreshToken: "refresh", expiresAt: 1_900_000_000,
  identity: {
    userId: "a0000000-0000-4000-8000-000000000001",
    companyId: "b0000000-0000-4000-8000-000000000001",
    profileId: "c0000000-0000-4000-8000-000000000001",
    email: "admin@example.com",
  },
};

describe("SaasOperationalShell", () => {
  beforeEach(() => window.history.replaceState({}, "", "/equipamentos"));

  it("redireciona rotas internas para Clientes e mantém somente a navegação Online", () => {
    render(<SaasOperationalShell session={session} onLock={vi.fn()} onSignOut={vi.fn()} onRemoveDevice={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Clientes Online" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clientes" })).toHaveAttribute("href", "/clientes");
    expect(screen.queryByText("Equipamentos")).not.toBeInTheDocument();
    expect(window.location.pathname).toBe("/clientes");
  });

  it("mantém as ações de sessão disponíveis no shell", async () => {
    const user = userEvent.setup();
    const onLock = vi.fn();
    const onSignOut = vi.fn();
    const onRemoveDevice = vi.fn();
    render(<SaasOperationalShell session={session} onLock={onLock} onSignOut={onSignOut} onRemoveDevice={onRemoveDevice} />);

    await user.click(screen.getByRole("button", { name: "Bloquear" }));
    await user.click(screen.getByRole("button", { name: "Sair" }));
    await user.click(screen.getByRole("button", { name: "Remover máquina" }));
    expect(onLock).toHaveBeenCalledOnce();
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(onRemoveDevice).toHaveBeenCalledOnce();
  });
});
