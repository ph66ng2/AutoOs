import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listarClientesPaginados: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  tabelas: [] as string[],
  aoVivo: null as null | (() => void),
}));

vi.mock("@/lib/db", () => ({ db: { listarClientesPaginados: mocks.listarClientesPaginados } }));
vi.mock("@/hooks/useAtualizacaoAoVivo", () => ({
  useAtualizacaoAoVivo: (tabelas: string[], cb: () => void) => { mocks.tabelas = tabelas; mocks.aoVivo = cb; },
  useDestaquesAoVivo: () => ({ destaques: new Map(), lembrar: () => {} }),
}));

import { useClientes } from "./useClientes";

describe("useClientes", () => {
  it("assina mudanças de equipamentos (OS aberta e último atendimento dependem delas)", () => {
    renderHook(() => useClientes({ filtro: "COM_OS_ABERTA" }));
    expect(mocks.tabelas).toEqual(expect.arrayContaining(["clientes", "cliente_contatos", "equipamentos"]));
  });

  it("recarga ao vivo pede a lista em segundo plano (não renova a sessão)", async () => {
    renderHook(() => useClientes({ filtro: "COM_OS_ABERTA" }));
    await waitFor(() => expect(mocks.listarClientesPaginados).toHaveBeenCalledWith(undefined, 0, "COM_OS_ABERTA"));
    await act(async () => { mocks.aoVivo?.(); });
    await waitFor(() => expect(mocks.listarClientesPaginados).toHaveBeenLastCalledWith(undefined, 0, "COM_OS_ABERTA", true));
  });

  it("preserva a página nova quando a recarga ao vivo da página antiga termina depois", async () => {
    let resolver!: (pagina: { items: { id: number }[]; total: number }) => void;
    const antiga = new Promise<{ items: { id: number }[]; total: number }>((resolve) => {
      resolver = resolve;
    });
    const { result, rerender } = renderHook(({ page }) => useClientes({ page }), {
      initialProps: { page: 1 },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    mocks.listarClientesPaginados.mockReturnValueOnce(antiga);
    act(() => mocks.aoVivo?.());
    expect(mocks.listarClientesPaginados).toHaveBeenLastCalledWith(undefined, 0, undefined, true);

    mocks.listarClientesPaginados.mockResolvedValueOnce({ items: [{ id: 51 }], total: 60 });
    rerender({ page: 2 });
    await waitFor(() => expect(result.current.clientes).toEqual([{ id: 51 }]));

    await act(async () => resolver({ items: [{ id: 1 }], total: 100 }));
    expect(result.current.clientes).toEqual([{ id: 51 }]);
    expect(result.current.total).toBe(60);
    expect(result.current.loading).toBe(false);
  });

  it("mantém a lista e o estado de erro quando a sessão bloqueia a recarga em segundo plano", async () => {
    mocks.listarClientesPaginados.mockResolvedValueOnce({ items: [{ id: 1 }], total: 1 });
    const { result } = renderHook(() => useClientes());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mocks.listarClientesPaginados.mockRejectedValueOnce(new Error("Acesso sensível bloqueado"));
    await act(async () => mocks.aoVivo?.());

    expect(result.current.clientes).toEqual([{ id: 1 }]);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
