import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { SensitiveAccessProvider } from "@/hooks/useSensitiveAccess";
import { definirTecnicosDaEmpresa, emailDoTecnico, tecnicosAtivos } from "@/lib/tecnicos";
import type { SecurityProfile, SensitiveAccessStatus } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));
vi.mock("next-themes", () => ({ useTheme: () => ({ setTheme: vi.fn() }) }));

// A lista geral de perfis traz um "Ivan" técnico de OUTRA empresa e um técnico desativado.
const perfis: SecurityProfile[] = [
  { id: 1, nome: "Atendente", role: "ATENDENTE", permissions: [], pin_configured: true, pin_required: true, is_default: true, ativo: true },
  { id: 2, nome: "Ivan", role: "TECNICO", permissions: [], pin_configured: true, pin_required: true, is_default: false, ativo: true, atende_tecnico: true, email_profissional: "ivan@outra-empresa.test" },
  { id: 3, nome: "Isaias", role: "TECNICO", permissions: [], pin_configured: true, pin_required: true, is_default: false, ativo: false, atende_tecnico: true, email_profissional: "isaias@empresa.test" },
];

function status(unlocked = true): SensitiveAccessStatus {
  return { pin_configured: true, unlocked, active_profile_id: 1, active_profile_name: "Atendente", active_role: "ATENDENTE", permissions: [], can_manage_profiles: false, profiles: perfis };
}

function responder(tecnicos: unknown, unlocked = true) {
  mockInvoke.mockImplementation((command: string) => {
    if (command === "get_sensitive_access_status") return Promise.resolve(status(unlocked));
    if (command === "listar_tecnicos_da_empresa") return Promise.resolve(tecnicos);
    return Promise.resolve(null);
  });
}

describe("técnicos da sessão", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    definirTecnicosDaEmpresa([]);
  });

  it("vêm do comando da empresa da sessão, não da lista geral de perfis (outra empresa, desativado)", async () => {
    responder([{ id: 7, nome: "Ivan", email_profissional: "ivan@minha-empresa.test" }]);
    render(<SensitiveAccessProvider><span /></SensitiveAccessProvider>);
    await waitFor(() => expect(emailDoTecnico("Ivan")).toBe("ivan@minha-empresa.test"));
    expect(tecnicosAtivos().map((t) => t.id)).toEqual([7]);
    expect(emailDoTecnico("Isaias")).toBe("");
  });

  it("sem técnicos na empresa da sessão, o homônimo de outra empresa não recebe cópia", async () => {
    responder([]);
    render(<SensitiveAccessProvider><span /></SensitiveAccessProvider>);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("listar_tecnicos_da_empresa"));
    expect(emailDoTecnico("Ivan")).toBe("");
    expect(tecnicosAtivos()).toEqual([]);
  });

  it("sessão bloqueada não consulta os técnicos", async () => {
    responder([{ id: 7, nome: "Ivan", email_profissional: "ivan@minha-empresa.test" }], false);
    render(<SensitiveAccessProvider><span /></SensitiveAccessProvider>);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("get_sensitive_access_status"));
    await new Promise((r) => setTimeout(r, 50));
    expect(mockInvoke).not.toHaveBeenCalledWith("listar_tecnicos_da_empresa");
  });
});
