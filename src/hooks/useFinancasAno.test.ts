import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listarEquipamentos: vi.fn(),
  resumoMensal: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: mocks }));

import { useFinancasAno } from "@/hooks/useFinancasAno";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useFinancasAno", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resumoMensal.mockResolvedValue({ total_fixo: 0, total_variavel: 0, total_geral: 0, por_categoria: [] });
  });

  it("ignora a resposta do ano anterior se o ano já mudou", async () => {
    const antiga = deferred<unknown[]>();
    const nova = deferred<unknown[]>();
    mocks.listarEquipamentos.mockReturnValueOnce(antiga.promise).mockReturnValueOnce(nova.promise);
    const hoje = new Date("2026-11-18T12:00:00");

    const { result, rerender } = renderHook(({ ano }: { ano: number }) => useFinancasAno(ano, 1000, hoje), {
      initialProps: { ano: 2026 },
    });

    await waitFor(() => expect(mocks.listarEquipamentos).toHaveBeenCalledTimes(1));
    rerender({ ano: 2025 });
    await waitFor(() => expect(mocks.listarEquipamentos).toHaveBeenCalledTimes(2));

    await act(async () => {
      antiga.resolve([{ data_aprovacao: "2026-11-10", valor_orcamento: 99999 }]);
      await antiga.promise;
    });

    expect(result.current.meses).toEqual([]);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      nova.resolve([{ data_aprovacao: "2025-06-10", valor_orcamento: 500 }]);
      await nova.promise;
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.meses.map((m) => m.ano)).toEqual(Array(12).fill(2025));
    expect(result.current.meses[5]?.faturado).toBe(500);
    expect(result.current.meses.some((m) => m.faturado === 99999)).toBe(false);
  });
});
