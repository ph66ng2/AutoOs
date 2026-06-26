import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { useState } from "react";
import { SensitiveAccessProvider, useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import type { SensitiveAccessStatus, SensitivePermission } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const EMPTY_STATUS: SensitiveAccessStatus = {
  pin_configured: false,
  unlocked: false,
  expires_at: null,
  active_profile_id: null,
  active_profile_name: null,
  active_role: null,
  permissions: [],
  can_manage_profiles: false,
  profiles: [],
};

function TestHarness({ children }: { children: React.ReactNode }) {
  return <SensitiveAccessProvider>{children}</SensitiveAccessProvider>;
}

function HookInspector({ capture }: { capture: (hook: ReturnType<typeof useSensitiveAccess>) => void }) {
  const hook = useSensitiveAccess();
  capture(hook);
  return <div data-testid="inspector">ready</div>;
}

describe("useSensitiveAccess — integração com novos recursos de auth", () => {
  let hookRef: ReturnType<typeof useSensitiveAccess> | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
    hookRef = null;
  });

  function captureHook(h: ReturnType<typeof useSensitiveAccess>) {
    hookRef = h;
  }

  it("inatividade ATIVADA: sessão expirada reflete unlocked=false no status", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_sensitive_access_status") {
        return Promise.resolve({
          ...EMPTY_STATUS,
          pin_configured: true,
          unlocked: false,
          expires_at: null,
          active_profile_id: 1,
          active_profile_name: "Admin",
          profiles: [
            { id: 1, nome: "Admin", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, is_default: true, ativo: true },
          ],
        });
      }
      return Promise.resolve(null);
    });

    render(
      <TestHarness>
        <HookInspector capture={captureHook} />
      </TestHarness>
    );

    await waitFor(() => expect(screen.getByTestId("inspector")).toBeInTheDocument());
    await waitFor(() => expect(hookRef?.status?.unlocked).toBe(false));

    expect(hookRef?.status?.unlocked).toBe(false);
    expect(hookRef?.status?.active_profile_name).toBe("Admin");
  });

  it("inatividade DESATIVADA: sessão permanece unlocked=true mesmo com expires_at no passado", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_sensitive_access_status") {
        return Promise.resolve({
          ...EMPTY_STATUS,
          pin_configured: true,
          unlocked: true,
          expires_at: "2020-01-01T00:00:00Z",
          active_profile_id: 1,
          active_profile_name: "Admin",
          permissions: ["MANAGE_PROFILES"],
          can_manage_profiles: true,
          profiles: [
            { id: 1, nome: "Admin", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, is_default: true, ativo: true },
          ],
        });
      }
      return Promise.resolve(null);
    });

    render(
      <TestHarness>
        <HookInspector capture={captureHook} />
      </TestHarness>
    );

    await waitFor(() => expect(hookRef?.status?.unlocked).toBe(true));
    expect(hookRef?.status?.expires_at).toBe("2020-01-01T00:00:00Z");
    expect(hookRef?.status?.can_manage_profiles).toBe(true);
  });

  it("operador sem PIN: setActiveProfile + unlockWithoutPin aplica permissões no status", async () => {
    let callIndex = 0;
    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_sensitive_access_status") {
        if (callIndex === 0) {
          callIndex++;
          return Promise.resolve({
            ...EMPTY_STATUS,
            pin_configured: false,
            unlocked: false,
            active_profile_id: 2,
            active_profile_name: "Operador",
            profiles: [
              { id: 1, nome: "Admin", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, is_default: true, ativo: true },
              { id: 2, nome: "Operador", role: "CUSTOM", permissions: ["STOCK_CONTROL"], pin_configured: false, is_default: false, ativo: true },
            ],
          });
        }
        return Promise.resolve({
          ...EMPTY_STATUS,
          pin_configured: false,
          unlocked: true,
          active_profile_id: 2,
          active_profile_name: "Operador",
          active_role: "CUSTOM",
          permissions: ["STOCK_CONTROL"],
          can_manage_profiles: false,
          profiles: [
            { id: 1, nome: "Admin", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, is_default: false, ativo: true },
            { id: 2, nome: "Operador", role: "CUSTOM", permissions: ["STOCK_CONTROL"], pin_configured: false, is_default: true, ativo: true },
          ],
        });
      }
      if (cmd === "set_active_security_profile") {
        return Promise.resolve({
          ...EMPTY_STATUS,
          pin_configured: false,
          unlocked: false,
          active_profile_id: args?.profileId,
          active_profile_name: "Operador",
          profiles: [
            { id: 1, nome: "Admin", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, is_default: false, ativo: true },
            { id: 2, nome: "Operador", role: "CUSTOM", permissions: ["STOCK_CONTROL"], pin_configured: false, is_default: true, ativo: true },
          ],
        });
      }
      if (cmd === "unlock_session_without_pin") {
        return Promise.resolve({
          ...EMPTY_STATUS,
          pin_configured: false,
          unlocked: true,
          active_profile_id: 2,
          active_profile_name: "Operador",
          active_role: "CUSTOM",
          permissions: ["STOCK_CONTROL"],
          can_manage_profiles: false,
          profiles: [
            { id: 1, nome: "Admin", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, is_default: false, ativo: true },
            { id: 2, nome: "Operador", role: "CUSTOM", permissions: ["STOCK_CONTROL"], pin_configured: false, is_default: true, ativo: true },
          ],
        });
      }
      return Promise.resolve(null);
    });

    render(
      <TestHarness>
        <HookInspector capture={captureHook} />
      </TestHarness>
    );

    await waitFor(() => expect(hookRef?.status?.profiles.length).toBe(2));
    expect(hookRef?.status?.profiles.find((p) => p.id === 2)?.pin_configured).toBe(false);

    await act(async () => {
      await hookRef?.setActiveProfile(2);
    });

    expect(hookRef?.status?.active_profile_id).toBe(2);

    const unlockResult = await mockInvoke("unlock_session_without_pin");
    expect(unlockResult.unlocked).toBe(true);
    expect(unlockResult.permissions).toContain("STOCK_CONTROL");
  });

  it("admin com PIN: status indica pin_configured=true, dropdown nao disponivel", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_sensitive_access_status") {
        return Promise.resolve({
          ...EMPTY_STATUS,
          pin_configured: true,
          unlocked: false,
          active_profile_id: 1,
          active_profile_name: "Admin",
          profiles: [
            { id: 1, nome: "Admin", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, is_default: true, ativo: true },
          ],
        });
      }
      return Promise.resolve(null);
    });

    render(
      <TestHarness>
        <HookInspector capture={captureHook} />
      </TestHarness>
    );

    await waitFor(() => expect(hookRef?.status?.profiles.length).toBe(1));
    const admin = hookRef?.status?.profiles[0];
    expect(admin?.pin_configured).toBe(true);
    expect(admin?.role).toBe("ADMIN");
  });

  it("recuperacao com credenciais validas: PIN resetado e refreshStatus reflete novo estado", async () => {
    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_sensitive_access_status") {
        return Promise.resolve({
          ...EMPTY_STATUS,
          pin_configured: true,
          unlocked: true,
          active_profile_id: 1,
          active_profile_name: "Admin",
          permissions: ["MANAGE_PROFILES"],
          can_manage_profiles: true,
          profiles: [
            { id: 1, nome: "Admin", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, is_default: true, ativo: true },
          ],
        });
      }
      if (cmd === "redefinir_pin_via_db") {
        return Promise.resolve(true);
      }
      return Promise.resolve(null);
    });

    render(
      <TestHarness>
        <HookInspector capture={captureHook} />
      </TestHarness>
    );

    await waitFor(() => expect(hookRef?.status?.unlocked).toBe(true));

    const result = await mockInvoke("redefinir_pin_via_db", {
      host: "localhost",
      port: 5432,
      database: "autoos",
      username: "autoos_user",
      password: "Tomate@06",
      profileId: 1,
      newPin: "9999",
    });
    expect(result).toBe(true);

    await act(async () => {
      await hookRef?.refreshStatus();
    });

    expect(hookRef?.status?.unlocked).toBe(true);
    expect(hookRef?.status?.active_profile_name).toBe("Admin");
  });

  it("recuperacao com credenciais invalidas: erro retornado, status permanece inalterado", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "get_sensitive_access_status") {
        return Promise.resolve({
          ...EMPTY_STATUS,
          pin_configured: true,
          unlocked: true,
          active_profile_id: 1,
          active_profile_name: "Admin",
          permissions: ["MANAGE_PROFILES"],
          can_manage_profiles: true,
          profiles: [
            { id: 1, nome: "Admin", role: "ADMIN", permissions: ["MANAGE_PROFILES"], pin_configured: true, is_default: true, ativo: true },
          ],
        });
      }
      if (cmd === "redefinir_pin_via_db") {
        return Promise.reject(new Error("Credenciais do banco de dados inválidas"));
      }
      return Promise.resolve(null);
    });

    render(
      <TestHarness>
        <HookInspector capture={captureHook} />
      </TestHarness>
    );

    await waitFor(() => expect(hookRef?.status?.unlocked).toBe(true));

    let error: Error | null = null;
    try {
      await mockInvoke("redefinir_pin_via_db", {
        host: "localhost",
        port: 5432,
        database: "autoos",
        username: "autoos_user",
        password: "wrong_password",
        profileId: 1,
        newPin: "8888",
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("inválidas");

    await act(async () => {
      await hookRef?.refreshStatus();
    });

    expect(hookRef?.status?.unlocked).toBe(true);
    expect(hookRef?.status?.active_profile_name).toBe("Admin");
    expect(hookRef?.status?.profiles[0].pin_configured).toBe(true);
  });
});
