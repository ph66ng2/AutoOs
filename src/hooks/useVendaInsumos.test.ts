import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ obterOrcamentoInsumos: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { obterOrcamentoInsumos: mocks.obterOrcamentoInsumos } }));

import { useVendaInsumos } from "./useVendaInsumos";

function adiada<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
}

const venda = (id: number) => ({ id, status: "RASCUNHO", itens: [] }) as never;

describe("useVendaInsumos", () => {
  beforeEach(() => mocks.obterOrcamentoInsumos.mockReset());

  it("descarta a resposta do id anterior que chega depois da troca de rota", async () => {
    const primeira = adiada<unknown>();
    const segunda = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockImplementation((id: number) => (id === 1 ? primeira.promessa : segunda.promessa));
    const { result, rerender } = renderHook(({ id }) => useVendaInsumos(id), { initialProps: { id: 1 } });

    rerender({ id: 2 });
    await act(async () => { segunda.resolver(venda(2)); });
    await waitFor(() => expect(result.current.venda?.id).toBe(2));

    await act(async () => { primeira.resolver(venda(1)); });
    expect(result.current.venda?.id).toBe(2);
    expect(result.current.loading).toBe(false);
  });

  it("erro atrasado do id anterior não aparece no orçamento atual", async () => {
    const primeira = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockImplementation((id: number) => (id === 1 ? primeira.promessa : Promise.resolve(venda(2))));
    const { result, rerender } = renderHook(({ id }) => useVendaInsumos(id), { initialProps: { id: 1 } });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.venda?.id).toBe(2));
    await act(async () => { primeira.rejeitar("falhou"); });
    expect(result.current.error).toBeNull();
    expect(result.current.venda?.id).toBe(2);
  });

  it("não expõe o orçamento anterior enquanto o novo id carrega", async () => {
    const segunda = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockImplementation((id: number) => (id === 1 ? Promise.resolve(venda(1)) : segunda.promessa));
    const { result, rerender } = renderHook(({ id }) => useVendaInsumos(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(result.current.venda?.id).toBe(1));

    rerender({ id: 2 });
    expect(result.current.venda).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => { segunda.resolver(venda(2)); });
    await waitFor(() => expect(result.current.venda?.id).toBe(2));
  });
});
