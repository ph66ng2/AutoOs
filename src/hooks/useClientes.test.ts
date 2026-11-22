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
});
