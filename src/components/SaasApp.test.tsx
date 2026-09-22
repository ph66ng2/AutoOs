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
  SaasOperationalShell: ({ session, onLock }: { session: SaasSession; onLock: () => void }) => (
    <section>
      <p>Shell SaaS Clientes</p>
      <p>{session.identity.email}</p>
      <button onClick={onLock}>Bloquear</button>
    </section>
  ),
}));

vi.mock("@/lib/saas-auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/saas-auth")>()),
  listSaasOperationalProfiles: vi.fn().mockResolvedValue([{
    id: "c0000000-0000-4000-8000-000000000001",
    name: "Admin operacional",
    role: "ADMIN",
    permissions: [],
  }]),
  auditSaasOperationalProfileSelection: vi.fn().mockResolvedValue(undefined),
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

  it("faz login e bloqueia removendo a identidade da tela", async () => {
    const authService = service();
    const user = userEvent.setup();
    renderApp(authService);
    await user.type(await screen.findByLabelText("Email"), "admin@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await user.type(await screen.findByLabelText("PIN de quatro dígitos"), "1234");
    await user.type(screen.getByLabelText("Confirmar PIN"), "1234");
    await user.click(screen.getByRole("button", { name: "Salvar PIN e continuar" }));
    expect(await screen.findByText("Shell SaaS Clientes")).toBeInTheDocument();
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
