import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { SensitiveAccessProvider, useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import type { SecurityProfile, SensitiveAccessStatus } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());
const setTheme = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme }) }));

function profile(id: number, tema: SecurityProfile["tema"]): SecurityProfile {
  return { id, nome: `Perfil ${id}`, role: "TECNICO", permissions: [], pin_configured: true, pin_required: true, is_default: false, ativo: true, tema };
}

function statusFor(active: SecurityProfile, unlocked = true): SensitiveAccessStatus {
  return {
    pin_configured: true,
    unlocked,
    active_profile_id: active.id,
    active_profile_name: active.nome,
    active_role: "TECNICO",
    permissions: [],
    can_manage_profiles: false,
    profiles: [profile(1, "dark"), profile(2, null)],
  };
}

describe("tema do perfil", () => {
  let hook: ReturnType<typeof useSensitiveAccess> | null = null;
  function Capture() {
    hook = useSensitiveAccess();
    return null;
  }

  beforeEach(() => {
    mockInvoke.mockReset();
    setTheme.mockReset();
    hook = null;
  });

  it("perfil sem tema escolhido volta ao claro em vez de herdar o escuro do perfil anterior", async () => {
    let current = statusFor(profile(1, "dark"));
    mockInvoke.mockImplementation((command: string) => (command === "get_sensitive_access_status" ? Promise.resolve(current) : Promise.resolve(null)));
    render(<SensitiveAccessProvider><Capture /></SensitiveAccessProvider>);

    await waitFor(() => expect(setTheme).toHaveBeenLastCalledWith("dark"));

    current = statusFor(profile(2, null));
    await act(async () => { await hook?.refreshStatus(); });

    await waitFor(() => expect(setTheme).toHaveBeenLastCalledWith("light"));
  });

  it("sessão bloqueada não mexe no tema", async () => {
    mockInvoke.mockImplementation((command: string) => (command === "get_sensitive_access_status" ? Promise.resolve(statusFor(profile(1, "dark"), false)) : Promise.resolve(null)));
    render(<SensitiveAccessProvider><Capture /></SensitiveAccessProvider>);
    await waitFor(() => expect(hook?.status).not.toBeNull());
    expect(setTheme).not.toHaveBeenCalled();
  });
});
