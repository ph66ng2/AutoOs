import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));

const mockListarPaginados = vi.hoisted(() => vi.fn());
const mockContar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  db: {
    listarEquipamentosPaginados: (...args: unknown[]) => mockListarPaginados(...args),
    contarEquipamentosPorStatus: (...args: unknown[]) => mockContar(...args),
  },
}));

import * as aoVivo from "@/lib/ao-vivo";
import { deveRecarregarAoMudarSessao, useRecarregarAoDesbloquear } from "../useRecarregarAoDesbloquear";
import { useEquipamentos } from "../useEquipamentos";

type Sessao = { active_profile_id: number | null; unlocked: boolean } | null;
const bloqueada = { active_profile_id: 1, unlocked: false };
const aberta = { active_profile_id: 1, unlocked: true };

describe("deveRecarregarAoMudarSessao", () => {
  it("só recarrega ao desbloquear ou ao trocar para outro perfil desbloqueado", () => {
    expect(deveRecarregarAoMudarSessao(bloqueada, aberta)).toBe(true);
    expect(deveRecarregarAoMudarSessao(aberta, { active_profile_id: 2, unlocked: true })).toBe(true);
    expect(deveRecarregarAoMudarSessao(aberta, aberta)).toBe(false);
    expect(deveRecarregarAoMudarSessao(aberta, bloqueada)).toBe(false);
    expect(deveRecarregarAoMudarSessao(null, aberta)).toBe(false);
  });
});

describe("useRecarregarAoDesbloquear", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockListarPaginados.mockReset().mockResolvedValue({ items: [], total: 0 });
    mockContar.mockReset().mockResolvedValue([]);
  });

  it("não recarrega na montagem nem enquanto continua desbloqueada; recarrega uma vez ao desbloquear", () => {
    const spy = vi.spyOn(aoVivo, "recarregarTodas");
    const { rerender } = renderHook(({ s }: { s: Sessao }) => useRecarregarAoDesbloquear(s), { initialProps: { s: null as Sessao } });
    rerender({ s: aberta });
    rerender({ s: { ...aberta } });
    expect(spy).not.toHaveBeenCalled();
    rerender({ s: bloqueada });
    expect(spy).not.toHaveBeenCalled();
    rerender({ s: aberta });
    expect(spy).toHaveBeenCalledTimes(1);
    rerender({ s: { ...aberta } });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("montada já bloqueada, o primeiro desbloqueio recarrega", () => {
    const spy = vi.spyOn(aoVivo, "recarregarTodas");
    const { rerender } = renderHook(({ s }: { s: Sessao }) => useRecarregarAoDesbloquear(s), { initialProps: { s: bloqueada as Sessao } });
    expect(spy).not.toHaveBeenCalled();
    rerender({ s: aberta });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a lista de equipamentos aberta recarrega em segundo plano ao desbloquear", async () => {
    const lista = renderHook(() => useEquipamentos({ status: "RECEBIDO" }));
    await waitFor(() => expect(lista.result.current.loading).toBe(false));
    expect(mockListarPaginados).toHaveBeenCalledTimes(1);

    const sessao = renderHook(({ s }: { s: Sessao }) => useRecarregarAoDesbloquear(s), { initialProps: { s: bloqueada as Sessao } });
    sessao.rerender({ s: aberta });

    await waitFor(() => expect(mockListarPaginados).toHaveBeenCalledTimes(2));
    // Último argumento: segundo plano (não renova a sessão nem abre o PIN).
    expect(mockListarPaginados.mock.calls[1]?.at(-1)).toBe(true);
    expect(lista.result.current.loading).toBe(false);
  });
});
