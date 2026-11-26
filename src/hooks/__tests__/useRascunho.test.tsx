import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { quandoRascunho, useRascunho } from "../useRascunho";

describe("useRascunho", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("salva depois de uma pausa, lê de volta e some ao limpar", () => {
    const { result } = renderHook(() => useRascunho<{ serie: string }>("teste"));
    act(() => { result.current.salvar({ serie: "A" }); result.current.salvar({ serie: "AB" }); });
    expect(localStorage.getItem("autoos:rascunho:teste")).toBeNull();
    act(() => { vi.advanceTimersByTime(500); });
    expect(localStorage.getItem("autoos:rascunho:teste")).toContain("AB");
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

describe("useRascunho: sair no meio da pausa", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("desmontar grava na hora o que estava pendente", () => {
    const { result, unmount } = renderHook(() => useRascunho<{ serie: string }>("teste"));
    act(() => result.current.salvar({ serie: "ZB-1" }));
    unmount();
    const { result: depois } = renderHook(() => useRascunho<{ serie: string }>("teste"));
    expect(depois.current.ler()?.dados).toEqual({ serie: "ZB-1" });
  });

  it("fechar o app (pagehide) grava o pendente", () => {
    const { result } = renderHook(() => useRascunho<{ serie: string }>("teste"));
    act(() => result.current.salvar({ serie: "ZB-2" }));
    window.dispatchEvent(new Event("pagehide"));
    expect(result.current.ler()?.dados).toEqual({ serie: "ZB-2" });
  });
});

describe("useRascunho: reabrir dentro da pausa", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ler devolve o que ainda estava pendente", () => {
    const { result } = renderHook(() => useRascunho<{ serie: string }>("teste"));
    act(() => result.current.salvar({ serie: "ZB-3" }));
    expect(result.current.ler()?.dados).toEqual({ serie: "ZB-3" });
  });
});

describe("useRascunho: limparSe", () => {
  it("só apaga quando o gravado é do dono", () => {
    const { result } = renderHook(() => useRascunho<{ dono: string }>("teste"));
    act(() => result.current.salvarAgora({ dono: "novo" }));
    act(() => result.current.limparSe((dados) => dados.dono === "antigo"));
    expect(result.current.ler()?.dados).toEqual({ dono: "novo" });
    act(() => result.current.limparSe((dados) => dados.dono === "novo"));
    expect(result.current.ler()).toBeNull();
  });
});

it("grava a escrita pendente na chave de origem mesmo após trocar de escopo", () => {
  const { result, rerender } = renderHook(({ chave }) => useRascunho<string>(chave), {
    initialProps: { chave: "empresa-a:perfil-a" as string | null },
  });
  act(() => result.current.salvar("anotação de A"));
  rerender({ chave: "empresa-b:perfil-b" });
  expect(result.current.ler()).toBeNull();
  act(() => result.current.salvar("anotação de B"));
  rerender({ chave: null });
  expect(result.current.ler()).toBeNull();
  act(() => window.dispatchEvent(new Event("pagehide")));
  rerender({ chave: "empresa-a:perfil-a" });
  expect(result.current.ler()?.dados).toBe("anotação de A");
  rerender({ chave: "empresa-b:perfil-b" });
  expect(result.current.ler()?.dados).toBe("anotação de B");
});
