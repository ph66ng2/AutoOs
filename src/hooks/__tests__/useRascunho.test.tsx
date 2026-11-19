import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quandoRascunho, useRascunho } from "../useRascunho";

describe("useRascunho", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("salva depois de uma pausa, lê de volta e some ao limpar", () => {
    const { result } = renderHook(() => useRascunho<{ serie: string }>("teste"));
    act(() => { result.current.salvar({ serie: "A" }); result.current.salvar({ serie: "AB" }); });
    expect(result.current.ler()).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.ler()?.dados).toEqual({ serie: "AB" });
    act(() => result.current.limpar());
    expect(result.current.ler()).toBeNull();
  });

  it("limpar cancela um salvamento pendente", () => {
    const { result } = renderHook(() => useRascunho<{ serie: string }>("teste"));
    act(() => { result.current.salvar({ serie: "A" }); result.current.limpar(); vi.advanceTimersByTime(500); });
    expect(result.current.ler()).toBeNull();
  });

  it("conteúdo inválido no armazenamento vira nenhum rascunho", () => {
    localStorage.setItem("autoos:rascunho:teste", "{quebrado");
    const { result } = renderHook(() => useRascunho("teste"));
    expect(result.current.ler()).toBeNull();
  });
});

describe("quandoRascunho", () => {
  it("diz 'hoje' no mesmo dia e a data nos outros", () => {
    const agora = new Date(2026, 10, 19, 15, 0);
    expect(quandoRascunho(new Date(2026, 10, 19, 14, 32).toISOString(), agora)).toBe("hoje às 14:32");
    expect(quandoRascunho(new Date(2026, 10, 18, 9, 5).toISOString(), agora)).toBe("18/11 às 09:05");
  });
});
