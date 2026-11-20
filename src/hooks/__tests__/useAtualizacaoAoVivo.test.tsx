import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));

import { distribuirMudancas } from "@/lib/ao-vivo";
import { useAtualizacaoAoVivo, useDestaquesAoVivo } from "../useAtualizacaoAoVivo";

describe("useAtualizacaoAoVivo", () => {
  it("chama a recarga quando muda uma tabela assinada", () => {
    const recarregar = vi.fn();
    const { unmount } = renderHook(() => useAtualizacaoAoVivo(["produtos"], recarregar));
    act(() => distribuirMudancas([{ tabela: "produtos", id: 1, referencia: null, operacao: "U" }]));
    expect(recarregar).toHaveBeenCalledTimes(1);
    unmount();
    act(() => distribuirMudancas([{ tabela: "produtos", id: 1, referencia: null, operacao: "U" }]));
    expect(recarregar).toHaveBeenCalledTimes(1);
  });
});

describe("useDestaquesAoVivo", () => {
  type Item = { id: number; v: string };
  const chave = (i: Item) => i.id;
  const versao = (i: Item) => i.v;

  it("só destaca depois de lembrar (atualização ao vivo); troca de página não destaca", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ itens }) => useDestaquesAoVivo(itens, chave, versao), { initialProps: { itens: [{ id: 1, v: "a" }] as Item[] } });
    rerender({ itens: [{ id: 2, v: "a" }] });
    expect(result.current.destaques.size).toBe(0);

    act(() => result.current.lembrar());
    rerender({ itens: [{ id: 3, v: "a" }, { id: 2, v: "b" }] });
    expect(result.current.destaques.get(3)).toBe("novo");
    expect(result.current.destaques.get(2)).toBe("alterado");
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.destaques.size).toBe(0);
    vi.useRealTimers();
  });
});
