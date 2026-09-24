import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaasOperationalShell } from "@/components/SaasOperationalShell";
import type { SaasSession } from "@/types/saas-auth";

vi.mock("@/pages/SaasClientesPage", () => ({
  default: () => <h1>Clientes Online</h1>,
}));
vi.mock("@/pages/Equipamentos", () => ({
  default: () => <h1>Equipamentos Online</h1>,
}));
vi.mock("@/components/saas/SaasTeamSettingsPage", () => ({
  SaasTeamSettingsPage: () => <h1>Equipe e Acessos Online</h1>,
  SaasTeamAccessDenied: () => <h1>Acesso restrito</h1>,
}));

const session: SaasSession = {
  accessToken: "access", refreshToken: "refresh", expiresAt: 1_900_000_000,
  identity: {
    userId: "a0000000-0000-4000-8000-000000000001",
    companyId: "b0000000-0000-4000-8000-000000000001",
    profileId: "c0000000-0000-4000-8000-000000000001",
    email: "admin@example.com",
  },
  profile: { id: "c0000000-0000-4000-8000-000000000001", name: "Admin AutoOS", role: "ADMIN", permissions: [] },
};
const profile = session.profile;

describe("SaasOperationalShell", () => {
  beforeEach(() => window.history.replaceState({}, "", "/not-real"));

  it("redireciona rotas desconhecidas e mostra os módulos SaaS com o perfil resolvido", () => {
    render(<SaasOperationalShell session={session} profile={profile} onLock={vi.fn()} onSignOut={vi.fn()} onRemoveDevice={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Clientes Online" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clientes" })).toHaveAttribute("href", "/clientes");
    expect(screen.getByRole("link", { name: "Equipamentos" })).toHaveAttribute("href", "/equipamentos");
    expect(window.location.pathname).toBe("/clientes");
  });

  it("mantém as ações de sessão disponíveis no shell", async () => {
    const user = userEvent.setup();
    const onLock = vi.fn();
    const onSignOut = vi.fn();
    const onRemoveDevice = vi.fn();
    render(<SaasOperationalShell session={session} profile={profile} onLock={onLock} onSignOut={onSignOut} onRemoveDevice={onRemoveDevice} />);

    await user.click(screen.getByRole("button", { name: "Bloquear" }));
    await user.click(screen.getByRole("button", { name: "Sair" }));
    await user.click(screen.getByRole("button", { name: "Remover máquina" }));
    expect(onLock).toHaveBeenCalledOnce();
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(onRemoveDevice).toHaveBeenCalledOnce();
  });

  it("expõe Equipe e Acessos somente para ADMIN e permite abrir a rota", async () => {
    const user = userEvent.setup();
    render(<SaasOperationalShell session={session} profile={profile} onLock={vi.fn()} onSignOut={vi.fn()} onRemoveDevice={vi.fn()} />);

    const teamLink = screen.getByRole("link", { name: "Equipe e Acessos" });
    expect(teamLink).toHaveAttribute("href", "/configuracoes/equipe");
    await user.click(teamLink);
    expect(screen.getByRole("heading", { name: "Equipe e Acessos Online" })).toBeInTheDocument();
  });

  it("nega a rota direta e oculta a navegação para funcionário não-ADMIN", () => {
    window.history.replaceState({}, "", "/configuracoes/equipe");
    const employeeProfile = { ...profile, role: "TECNICO" };
    render(<SaasOperationalShell session={session} profile={employeeProfile} onLock={vi.fn()} onSignOut={vi.fn()} onRemoveDevice={vi.fn()} />);

    expect(screen.queryByRole("link", { name: "Equipe e Acessos" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Acesso restrito" })).toBeInTheDocument();
  });
});
