import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaasApp } from "@/components/SaasApp";
import { SaasAuthProvider } from "@/hooks/useSaasAuth";
import type { SaasAuthService, SaasSession } from "@/types/saas-auth";

const session: SaasSession = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
  identity: {
    userId: "a0000000-0000-4000-8000-000000000001",
    companyId: "b0000000-0000-4000-8000-000000000001",
    profileId: "c0000000-0000-4000-8000-000000000001",
    email: "admin@example.com",
  },
};

function service(overrides: Partial<SaasAuthService> = {}): SaasAuthService {
  return {
    login: vi.fn().mockResolvedValue(session),
    restoreSession: vi.fn().mockResolvedValue({ kind: "signed_out" }),
    refreshSession: vi.fn().mockResolvedValue({ kind: "authenticated", session }),
    lock: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue({ revoked: true }),
    requestPasswordRecovery: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderApp(authService: SaasAuthService) {
  return render(<SaasAuthProvider service={authService}><SaasApp /></SaasAuthProvider>);
}

describe("SaasApp", () => {
  it("restaura o boot SaaS e oferece somente login, sem cadastro", async () => {
    renderApp(service());
    expect(screen.getByText("Restaurando sessão segura...")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "AutoOS SaaS" })).toBeInTheDocument();
    expect(screen.queryByText(/cadastrar/i)).not.toBeInTheDocument();
    expect(screen.getByText(/cadastro de empresas é feito somente pelo suporte/i)).toBeInTheDocument();
  });

  it("faz login e bloqueia removendo a identidade da tela", async () => {
    const authService = service();
    const user = userEvent.setup();
    renderApp(authService);
    await user.type(await screen.findByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Sessão SaaS autenticada")).toBeInTheDocument();
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(await screen.findByText(/Aplicativo bloqueado/)).toBeInTheDocument();
    expect(authService.lock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(COMPANY_ID)).not.toBeInTheDocument();
  });

  it("mantém a sessão recuperável quando o boot está offline", async () => {
    const authService = service({
      restoreSession: vi.fn().mockResolvedValue({ kind: "offline_recoverable", session, message: "Sem conexão; sessão preservada." }),
    });
    const user = userEvent.setup();
    renderApp(authService);
    expect(await screen.findByText("Autenticação temporariamente offline")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await waitFor(() => expect(authService.restoreSession).toHaveBeenCalledTimes(2));
  });

  it("renova automaticamente uma sessão próxima da expiração", async () => {
    const expiring = { ...session, expiresAt: Math.floor(Date.now() / 1_000) + 30 };
    const authService = service({
      restoreSession: vi.fn().mockResolvedValue({ kind: "authenticated", session: expiring }),
      refreshSession: vi.fn().mockResolvedValue({ kind: "signed_out", message: "Sessão renovada para teste." }),
    });
    renderApp(authService);
    await waitFor(() => expect(authService.refreshSession).toHaveBeenCalledWith(expiring));
  });

  it("solicita recuperação sem revelar se o email existe", async () => {
    const authService = service();
    const user = userEvent.setup();
    renderApp(authService);
    await user.type(await screen.findByLabelText("Email"), "unknown@example.com");
    await user.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    expect(await screen.findByText(/Se o email estiver habilitado/)).toBeInTheDocument();
    expect(authService.requestPasswordRecovery).toHaveBeenCalledWith("unknown@example.com");
  });
});

const COMPANY_ID = session.identity.companyId;
