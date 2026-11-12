import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SensitiveAccessProvider } from "@/hooks/useSensitiveAccess";
import type { SecurityProfile, SensitiveAccessStatus } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));
vi.mock("@/lib/ui-sounds", () => ({ playUiSound: vi.fn() }));

const admin: SecurityProfile = { id: 1, nome: "Admin", role: "ADMIN", permissions: [], pin_required: true, pin_configured: true, is_default: true, ativo: true };

function statusWith(...profiles: SecurityProfile[]): SensitiveAccessStatus {
  return {
    pin_configured: true,
    unlocked: false,
    expires_at: null,
    active_profile_id: 1,
    active_profile_name: "Admin",
    active_role: "ADMIN",
    permissions: [],
    can_manage_profiles: false,
    profiles,
  };
}

function renderWith(status: SensitiveAccessStatus) {
  mockInvoke.mockImplementation((cmd: string) => Promise.resolve(cmd === "get_sensitive_access_status" ? status : null));
  return render(<SensitiveAccessProvider><span /></SensitiveAccessProvider>);
}

/** A janela de perfis (Radix) marca o resto da página como aria-hidden e bloqueia o ponteiro. */
const button = (name: string | RegExp) => screen.getByRole("button", { name, hidden: true });

/** Clique de verdade: o botão recebe o foco antes, e a trava de foco da janela passa a devolvê-lo a ele. */
function press(element: HTMLElement) {
  element.focus();
  fireEvent.click(element);
}

describe("primeiro acesso a partir da janela de perfis", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    localStorage.removeItem("autoos_last_profile_id");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (Element.prototype as { animate?: unknown }).animate;
  });

  it("Ativar neste computador leva o foco para o campo do código", async () => {
    const segundoPc: SecurityProfile = { id: 2, nome: "Recepção", role: "ATENDENTE", permissions: [], pin_required: true, pin_configured: false, is_default: false, ativo: true, onboarding_pendente: false };
    renderWith(statusWith(admin, segundoPc));
    fireEvent.click(await screen.findByRole("button", { name: /Recepção/ }));
    press(button("Ativar neste computador"));

    await waitFor(() => expect(screen.queryByLabelText("PIN do perfil")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement?.id).toBe("primeiro-acesso-codigo"));
  });

  it("Esqueci meu PIN leva o foco para o campo do código", async () => {
    renderWith(statusWith(admin));
    press(await screen.findByRole("button", { name: "Esqueci meu PIN: tenho um código do administrador" }));

    await waitFor(() => expect(screen.queryByLabelText("PIN do perfil")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement?.id).toBe("primeiro-acesso-codigo"));
  });

  it("voltar aos perfis durante o voo do avatar mantém a janela de perfis aberta", async () => {
    // Animação que não termina sozinha: o cancelamento acontece no meio do voo.
    const animation = { finished: new Promise(() => undefined), cancel: vi.fn(), effect: null };
    Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => animation) });
    const novo: SecurityProfile = { id: 3, nome: "Técnico novo", role: "TECNICO", permissions: [], pin_required: true, pin_configured: false, is_default: false, ativo: true, onboarding_pendente: true };
    renderWith(statusWith(admin, novo));
    fireEvent.click(await screen.findByRole("button", { name: /Técnico novo/ }));
    fireEvent.click(button("Fazer primeiro acesso"));

    // O voo começou (a ponte animou) e o assistente está montado atrás dele.
    await waitFor(() => expect(Element.prototype.animate).toHaveBeenCalled());
    expect(document.querySelector("[data-first-access-wizard]")).not.toBeNull();

    fireEvent.click(button("Voltar aos perfis"));

    await waitFor(() => expect(document.querySelector("[data-first-access-wizard]")).toBeNull());
    // Dá tempo para qualquer temporizador do voo cancelado agir.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(button("Fazer primeiro acesso")).toBeInTheDocument();
    expect(document.querySelector(".first-access-bridge")).toBeNull();

    // Sem estado preso: o primeiro acesso pode começar de novo.
    fireEvent.click(button("Fazer primeiro acesso"));
    await waitFor(() => expect(document.querySelector("[data-first-access-wizard]")).not.toBeNull());
  });

  it("Esc durante o voo do avatar cancela o primeiro acesso e mantém a janela de perfis", async () => {
    const animation = { finished: new Promise(() => undefined), cancel: vi.fn(), effect: null };
    Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => animation) });
    const novo: SecurityProfile = { id: 3, nome: "Técnico novo", role: "TECNICO", permissions: [], pin_required: true, pin_configured: false, is_default: false, ativo: true, onboarding_pendente: true };
    renderWith(statusWith(admin, novo));
    fireEvent.click(await screen.findByRole("button", { name: /Técnico novo/ }));
    fireEvent.click(button("Fazer primeiro acesso"));
    await waitFor(() => expect(document.querySelector("[data-first-access-wizard]")).not.toBeNull());

    fireEvent.keyDown(document.body, { key: "Escape" });

    await waitFor(() => expect(document.querySelector("[data-first-access-wizard]")).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(button("Fazer primeiro acesso")).toBeInTheDocument();
  });

  it("clique fora da janela durante o voo do avatar não cancela o primeiro acesso", async () => {
    const animation = { finished: new Promise(() => undefined), cancel: vi.fn(), effect: null };
    Object.defineProperty(Element.prototype, "animate", { configurable: true, writable: true, value: vi.fn(() => animation) });
    const novo: SecurityProfile = { id: 3, nome: "Técnico novo", role: "TECNICO", permissions: [], pin_required: true, pin_configured: false, is_default: false, ativo: true, onboarding_pendente: true };
    renderWith(statusWith(admin, novo));
    fireEvent.click(await screen.findByRole("button", { name: /Técnico novo/ }));
    fireEvent.click(button("Fazer primeiro acesso"));
    await waitFor(() => expect(Element.prototype.animate).toHaveBeenCalled());
    const wizard = document.querySelector<HTMLElement>("[data-first-access-wizard]")!;
    expect(wizard).not.toBeNull();

    // O clique cai no assistente que está abrindo, fora da janela de perfis.
    fireEvent.pointerDown(wizard, { button: 0, pointerType: "mouse" });
    fireEvent.click(wizard);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(document.querySelector("[data-first-access-wizard]")).not.toBeNull();
    expect(document.querySelector(".first-access-bridge")).not.toBeNull();
  });

  it("perfil com primeiro acesso pela metade retoma o assistente e, com a sessão bloqueada, pede o PIN nele mesmo", async () => {
    const pela_metade: SecurityProfile = { id: 60, nome: "QA Tres", role: "TECNICO", permissions: [], pin_required: true, pin_configured: true, is_default: false, ativo: true, onboarding_pendente: true };
    const locked = statusWith(admin, pela_metade);
    const tresAtivo: SensitiveAccessStatus = { ...locked, unlocked: true, active_profile_id: 60, active_profile_name: "QA Tres", active_role: "TECNICO" };
    const concluido: SensitiveAccessStatus = { ...tresAtivo, profiles: [admin, { ...pela_metade, onboarding_pendente: false }] };
    let saves = 0;
    mockInvoke.mockImplementation((cmd: string) => {
      switch (cmd) {
        case "get_sensitive_access_status": return Promise.resolve(locked);
        case "set_active_security_profile": return Promise.resolve(tresAtivo);
        // 1ª tentativa: a sessão foi bloqueada no meio do caminho (corrida do status periódico).
        case "salvar_personalizacao_perfil":
          saves += 1;
          return saves === 1 ? Promise.reject("Acesso sensível bloqueado. Informe o PIN para continuar.") : Promise.resolve(concluido);
        case "unlock_sensitive_access": return Promise.resolve(tresAtivo);
        default: return Promise.resolve(null);
      }
    });
    render(<SensitiveAccessProvider><span /></SensitiveAccessProvider>);

    fireEvent.click(await screen.findByRole("button", { name: /QA Tres/ }));
    fireEvent.change(screen.getByLabelText("PIN do perfil"), { target: { value: "2468" } });
    press(button("Entrar com este perfil"));

    // Reabrir o perfil retoma o assistente na etapa do perfil, sem pedir o código de novo.
    expect(await screen.findByRole("heading", { name: "Deixe com a sua cara" }, { timeout: 3000 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));

    // Nada de "Salvando…" pendurado nem janela de PIN escondida atrás do assistente.
    expect(await screen.findByLabelText("PIN deste computador")).toBeInTheDocument();
    expect(screen.queryByText("PIN necessário para continuar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Salvando/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("PIN deste computador"), { target: { value: "2468" } });
    fireEvent.click(screen.getByRole("button", { name: /Tentar de novo/ }));

    expect(await screen.findByRole("heading", { name: /Tudo pronto/ })).toBeInTheDocument();
    expect(mockInvoke).toHaveBeenCalledWith("unlock_sensitive_access", { pin: "2468" });
  });

  it("enquanto o assistente está aberto, um pedido de PIN de outra tela recusa na hora em vez de abrir atrás dele", async () => {
    const pela_metade: SecurityProfile = { id: 60, nome: "QA Tres", role: "TECNICO", permissions: [], pin_required: true, pin_configured: true, is_default: false, ativo: true, onboarding_pendente: true };
    const tresAtivo: SensitiveAccessStatus = { ...statusWith(admin, pela_metade), unlocked: true, active_profile_id: 60, active_profile_name: "QA Tres", active_role: "TECNICO" };
    const { withSensitiveAccessRetry } = await import("@/lib/sensitive-action-retry");
    mockInvoke.mockImplementation((cmd: string) => Promise.resolve(
      cmd === "get_sensitive_access_status" ? statusWith(admin, pela_metade) : cmd === "set_active_security_profile" ? tresAtivo : null,
    ));
    render(<SensitiveAccessProvider><span /></SensitiveAccessProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /QA Tres/ }));
    fireEvent.change(screen.getByLabelText("PIN do perfil"), { target: { value: "2468" } });
    press(button("Entrar com este perfil"));
    expect(await screen.findByRole("heading", { name: "Deixe com a sua cara" }, { timeout: 3000 })).toBeInTheDocument();

    const operation = vi.fn().mockRejectedValue("Acesso sensível bloqueado. Informe o PIN para continuar.");
    await expect(withSensitiveAccessRetry(operation)).rejects.toBe("Acesso sensível bloqueado. Informe o PIN para continuar.");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("PIN necessário para continuar")).not.toBeInTheDocument();
  });
});
