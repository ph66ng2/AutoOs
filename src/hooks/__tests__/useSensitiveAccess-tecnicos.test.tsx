import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { SensitiveAccessProvider, useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { definirTecnicosDaEmpresa, emailDoTecnico, tecnicosAtivos } from "@/lib/tecnicos";
import { copiaGerenciaPermitida, definirCopiaGerencia } from "@/lib/copia-gerencia";
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
    definirCopiaGerencia(null);
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

  it("troca de perfil (outra empresa) apaga técnicos e cópia da gerência antes de recarregar", async () => {
    let atual = { id: 1, tecnicos: [{ id: 7, nome: "Ivan", email_profissional: "ivan@empresa-a.test" }] as unknown, copia: true as unknown };
    let refresh: (() => Promise<void>) | undefined;
    function Captura() { refresh = useSensitiveAccess().refreshStatus; return null; }
    mockInvoke.mockImplementation((command: string) => {
      if (command === "get_sensitive_access_status") return Promise.resolve({ ...status(true), active_profile_id: atual.id });
      if (command === "listar_tecnicos_da_empresa") return atual.tecnicos instanceof Promise ? atual.tecnicos : Promise.resolve(atual.tecnicos);
      if (command === "copia_gerencia_da_empresa") return atual.copia instanceof Promise ? atual.copia : Promise.resolve(atual.copia);
      return Promise.resolve(null);
    });
    render(<SensitiveAccessProvider><Captura /></SensitiveAccessProvider>);
    await waitFor(() => expect(emailDoTecnico("Ivan")).toBe("ivan@empresa-a.test"));
    expect(copiaGerenciaPermitida()).toBe(true);

    // Perfil 2, de outra empresa: as respostas ainda não chegaram, e nada da empresa A sobra.
    atual = { id: 2, tecnicos: new Promise(() => undefined), copia: new Promise(() => undefined) };
    await act(async () => { await refresh?.(); });
    expect(emailDoTecnico("Ivan")).toBe("");
    expect(copiaGerenciaPermitida()).toBe(false);
  });

  it("bloquear a sessão apaga técnicos e cópia; desbloquear recarrega", async () => {
    let unlocked = true;
    let refresh: (() => Promise<void>) | undefined;
    function Captura() { refresh = useSensitiveAccess().refreshStatus; return null; }
    mockInvoke.mockImplementation((command: string) => {
      if (command === "get_sensitive_access_status") return Promise.resolve(status(unlocked));
      if (command === "listar_tecnicos_da_empresa") return Promise.resolve([{ id: 7, nome: "Ivan", email_profissional: "ivan@minha-empresa.test" }]);
      if (command === "copia_gerencia_da_empresa") return Promise.resolve(true);
      return Promise.resolve(null);
    });
    render(<SensitiveAccessProvider><Captura /></SensitiveAccessProvider>);
    await waitFor(() => expect(copiaGerenciaPermitida()).toBe(true));

    unlocked = false;
    await act(async () => { await refresh?.(); });
    expect(emailDoTecnico("Ivan")).toBe("");
    expect(copiaGerenciaPermitida()).toBe(false);

    unlocked = true;
    const chamadas = mockInvoke.mock.calls.filter(([c]) => c === "listar_tecnicos_da_empresa").length;
    await act(async () => { await refresh?.(); });
    await waitFor(() => expect(emailDoTecnico("Ivan")).toBe("ivan@minha-empresa.test"));
    expect(mockInvoke.mock.calls.filter(([c]) => c === "listar_tecnicos_da_empresa").length).toBeGreaterThan(chamadas);
    expect(copiaGerenciaPermitida()).toBe(true);
  });

  it("volta do foco da janela recarrega os técnicos (marcação feita em outro computador)", async () => {
    let tecnicos: unknown = [];
    mockInvoke.mockImplementation((command: string) => {
      if (command === "get_sensitive_access_status") return Promise.resolve(status(true));
      if (command === "listar_tecnicos_da_empresa") return Promise.resolve(tecnicos);
      return Promise.resolve(null);
    });
    render(<SensitiveAccessProvider><span /></SensitiveAccessProvider>);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("listar_tecnicos_da_empresa"));
    tecnicos = [{ id: 8, nome: "Joana", email_profissional: "joana@minha-empresa.test" }];
    act(() => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(emailDoTecnico("Joana")).toBe("joana@minha-empresa.test"));
  });
});
