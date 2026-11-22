import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listarReceitaAprovada: vi.fn(),
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
    mocks.listarReceitaAprovada.mockReturnValueOnce(antiga.promise).mockReturnValueOnce(nova.promise);
    const hoje = new Date("2026-11-18T12:00:00");

    const { result, rerender } = renderHook(({ ano }: { ano: number }) => useFinancasAno(ano, 1000, hoje), {
      initialProps: { ano: 2026 },
    });

    await waitFor(() => expect(mocks.listarReceitaAprovada).toHaveBeenCalledTimes(1));
    rerender({ ano: 2025 });
    await waitFor(() => expect(mocks.listarReceitaAprovada).toHaveBeenCalledTimes(2));

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

  it("avisa quando um resumo mensal falha em vez de tratar o mês como zero", async () => {
    mocks.listarReceitaAprovada.mockResolvedValue([]);
    mocks.resumoMensal.mockImplementation(async (mes: number, ano: number) => {
      if (ano === 2026 && mes === 3) throw new Error("falha no resumo");
      return { total_fixo: 0, total_variavel: 250, total_geral: 0, por_categoria: [] };
    });
    const { result } = renderHook(() => useFinancasAno(2026, 1000, new Date("2026-11-18T12:00:00")));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Não foi possível carregar os gastos de alguns meses.");
    expect(result.current.meses).toEqual([]);
    expect(result.current.anterior).toEqual([]);
  });
  it("soma todas as OS aprovadas do ano (mais de 50), pedindo o período inteiro ao backend", async () => {
    // 60 OS aprovadas em março: a lista antiga (LIMIT 50) perderia 10 delas.
    mocks.listarReceitaAprovada.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => ({ data_aprovacao: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`, valor_orcamento: 100, valor_final: null })),
    );
    const hoje = new Date("2026-11-18T12:00:00");
    const { result } = renderHook(() => useFinancasAno(2026, 0, hoje));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.listarReceitaAprovada).toHaveBeenCalledWith(2024, 2027);
    expect(result.current.meses[2]?.faturado).toBe(6000);
  });
});
