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
});
