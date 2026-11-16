import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLarguraMinima } from "./useLarguraMinima";

describe("useLarguraMinima", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sem matchMedia considera tela larga", () => {
    const { result } = renderHook(() => useLarguraMinima(768));
    expect(result.current).toBe(true);
  });

  it("segue a consulta e reage à mudança de largura", () => {
    let ouvinte: (() => void) | null = null;
    const mq = { matches: false, addEventListener: (_: string, fn: () => void) => { ouvinte = fn; }, removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", vi.fn(() => mq));
    const { result } = renderHook(() => useLarguraMinima(768));
    expect(result.current).toBe(false);
    mq.matches = true;
    act(() => ouvinte?.());
    expect(result.current).toBe(true);
  });
});
