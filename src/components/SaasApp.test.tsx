import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaasApp } from "@/components/SaasApp";
import { BootUiProvider } from "@/components/BootUi";
import { SaasAuthProvider } from "@/hooks/useSaasAuth";
import { DAILY_BOOT_OPENING_STORAGE_KEY } from "@/lib/daily-boot-opening";
import { todayLocalIsoDate } from "@/lib/date-utils";
import type { SaasAuthService, SaasSession } from "@/types/saas-auth";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

vi.mock("@/components/SaasOperationalShell", () => ({
  SaasOperationalShell: ({ session, profile, onLock }: { session: SaasSession; profile: SaasSession["profile"]; onLock: () => void }) => (
    <section>
      <p>Shell SaaS Clientes</p>
      <p>{session.identity.email}</p>
      <p>{profile.name} · {profile.role}</p>
      <button onClick={onLock}>Bloquear</button>
    </section>
  ),
}));

vi.mock("@/components/BootSplashGate", () => ({
  BootSplashGate: ({
    loading,
    progress,
    onFinished,
  }: {
    loading: boolean;
    progress: number;
    onFinished?: () => void;
  }) => {
    if (!loading) {
      queueMicrotask(() => onFinished?.());
    }
    return (
      <div role="status" aria-label={`Carregando aplicativo ${Math.round(progress)} por cento`}>
        {loading ? "Restaurando sessão segura..." : "Abrindo AutoOS..."}
      </div>
    );
  },
}));

const COMPANY_ID = "b0000000-0000-4000-8000-000000000001";

const session: SaasSession = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
  identity: {
    userId: "a0000000-0000-4000-8000-000000000001",
    companyId: COMPANY_ID,
    profileId: "c0000000-0000-4000-8000-000000000001",
    email: "tecnico@example.com",
  },
  profile: {
    id: "c0000000-0000-4000-8000-000000000001",
    name: "Técnica",
    role: "TECNICO",
    permissions: ["EQUIPAMENTOS_VISUALIZAR"],
  },
};

function service(overrides: Partial<SaasAuthService> = {}): SaasAuthService {
  return {
    login: vi.fn().mockResolvedValue(session),
    restoreSession: vi.fn().mockResolvedValue({ kind: "signed_out" }),
    refreshSession: vi.fn().mockResolvedValue({ kind: "authenticated", session }),
    lock: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue({ revoked: true }),
    removeThisDevice: vi.fn().mockResolvedValue({ revoked: true }),
    requestPasswordRecovery: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderApp(authService: SaasAuthService) {
  return render(
    <BootUiProvider>
      <SaasAuthProvider service={authService}>
        <SaasApp />
      </SaasAuthProvider>
    </BootUiProvider>,
  );
}

describe("SaasApp", () => {
  beforeEach(() => {
    window.localStorage.clear();
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string) => command === "status_pin_perfil_saas"
      ? Promise.resolve({ configured: false, lockedUntil: null })
      : Promise.resolve(undefined));
  });

  it("mostra a abertura antes do login e só então revela a tela de entrada", async () => {
    renderApp(service());
    expect(screen.getByText("Restaurando sessão segura...")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "AutoOS SaaS" })).toBeInTheDocument();
    expect(screen.queryByText(/cadastrar/i)).not.toBeInTheDocument();
    expect(screen.getByText(/cadastro de empresas é feito somente pelo suporte/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(DAILY_BOOT_OPENING_STORAGE_KEY)).toBe(todayLocalIsoDate());
  });

  it("pula a abertura nos boots seguintes do mesmo dia e vai direto ao login", async () => {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, todayLocalIsoDate());
    renderApp(service());
    expect(screen.queryByText("Restaurando sessão segura...")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "AutoOS SaaS" })).toBeInTheDocument();
  });

  it("nos boots seguintes espera a sessão sem repetir o stamp", async () => {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, todayLocalIsoDate());
    renderApp(service({
      restoreSession: vi.fn().mockImplementation(() => new Promise(() => {})),
    }));
    expect(screen.queryByText("Restaurando sessão segura...")).not.toBeInTheDocument();
    expect(await screen.findByText("Preparando sessão…")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "AutoOS SaaS" })).not.toBeInTheDocument();
  });

  it("usa o perfil server-side sem seletor e mantém o PIN opcional/local", async () => {
    const authService = service();
    const user = userEvent.setup();
    renderApp(authService);
    await user.type(await screen.findByLabelText("Email"), "tecnico@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("heading", { name: "Configure um PIN local (opcional)" })).toBeInTheDocument();
    expect(screen.getByText("Técnica · tecnico@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Selecione o perfil operacional")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar sem PIN" }));
    expect(await screen.findByText("Shell SaaS Clientes")).toBeInTheDocument();
    expect(screen.getByText("tecnico@example.com")).toBeInTheDocument();
    expect(screen.getByText("Técnica · TECNICO")).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith("configurar_pin_perfil_saas", expect.anything());
    await user.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(await screen.findByRole("heading", { name: "Acesso local bloqueado" })).toBeInTheDocument();
    expect(authService.lock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(COMPANY_ID)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar sem PIN" }));
    expect(await screen.findByText("Shell SaaS Clientes")).toBeInTheDocument();
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

  it("mantém a tela bloqueada após renovar a sessão e exige o PIN se o perfil mudar", async () => {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, todayLocalIsoDate());
    const expiring = { ...session, expiresAt: Math.floor(Date.now() / 1_000) + 30 };
    const changedProfile: SaasSession = {
      ...session,
      expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
      identity: { ...session.identity, profileId: "c0000000-0000-4000-8000-000000000002" },
      profile: { id: "c0000000-0000-4000-8000-000000000002", name: "Supervisora", role: "SUPERVISOR", permissions: [] },
    };
    const authService = service({
      restoreSession: vi.fn().mockResolvedValue({ kind: "authenticated", session: expiring }),
      refreshSession: vi.fn().mockResolvedValue({ kind: "authenticated", session: changedProfile }),
    });

    renderApp(authService);

    await waitFor(() => expect(authService.refreshSession).toHaveBeenCalledWith(expiring));
    expect(await screen.findByText("Supervisora · tecnico@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Shell SaaS Clientes")).not.toBeInTheDocument();
  });

  it("continua renovando a sessão sem desbloquear a interface", async () => {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, todayLocalIsoDate());
    const expiring = { ...session, expiresAt: Math.floor(Date.now() / 1_000) + 63 };
    const renewed = { ...session, expiresAt: Math.floor(Date.now() / 1_000) + 3_600 };
    const authService = service({
      restoreSession: vi.fn().mockResolvedValue({ kind: "authenticated", session: expiring }),
      refreshSession: vi.fn().mockResolvedValue({ kind: "authenticated", session: renewed }),
    });
    const user = userEvent.setup();

    renderApp(authService);
    expect(await screen.findByRole("heading", { name: "Configure um PIN local (opcional)" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continuar sem PIN" }));
    expect(await screen.findByText("Shell SaaS Clientes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(await screen.findByRole("heading", { name: "Acesso local bloqueado" })).toBeInTheDocument();

    await waitFor(() => expect(authService.refreshSession).toHaveBeenCalledWith(expiring), { timeout: 5_000 });
    expect(screen.getByRole("heading", { name: "Acesso local bloqueado" })).toBeInTheDocument();
    expect(screen.queryByText("Shell SaaS Clientes")).not.toBeInTheDocument();
  }, 8_000);

  it("abre uma tela própria de recuperação sem revelar se o email existe", async () => {
    const authService = service();
    const user = userEvent.setup();
    renderApp(authService);
    await user.type(await screen.findByLabelText("Email"), "unknown@example.com");
    await user.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
    expect(await screen.findByRole("heading", { name: "Recuperar senha" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email da Conta")).toHaveValue("unknown@example.com");
    await user.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
    expect(await screen.findByText(/Se o email estiver habilitado/)).toBeInTheDocument();
    expect(authService.requestPasswordRecovery).toHaveBeenCalledWith("unknown@example.com");
    await user.click(screen.getByRole("button", { name: "Voltar para entrar" }));
    expect(await screen.findByRole("heading", { name: "AutoOS SaaS" })).toBeInTheDocument();
  });
});
