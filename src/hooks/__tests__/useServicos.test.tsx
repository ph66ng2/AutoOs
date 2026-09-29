import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ carregarRepositorio: vi.fn(), listar: vi.fn() }));

vi.mock("@/lib/data/servicos-repository", () => ({
  carregarRepositorioServicos: mocks.carregarRepositorio,
}));

import { useServicos } from "@/hooks/useServicos";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useServicos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.carregarRepositorio.mockResolvedValue({ listar: mocks.listar });
  });

  it("ignores an older page/search response that resolves after the latest request", async () => {
    const oldPageRequest = deferred<{ items: never[]; total: number }>();
    const searchOldPageRequest = deferred<{ items: never[]; total: number }>();
    const searchFirstPageRequest = deferred<{ items: never[]; total: number }>();
    mocks.listar
      .mockReturnValueOnce(oldPageRequest.promise)
      .mockReturnValueOnce(searchOldPageRequest.promise)
      .mockReturnValueOnce(searchFirstPageRequest.promise);

    const { result, rerender } = renderHook(
      ({ busca, page }: { busca?: string; page: number }) => useServicos({ busca, page }),
      { initialProps: { busca: undefined, page: 2 } },
    );
    await waitFor(() => expect(mocks.listar).toHaveBeenCalledTimes(1));

    rerender({ busca: "limpeza", page: 2 });
    await waitFor(() => expect(mocks.listar).toHaveBeenCalledTimes(2));
    rerender({ busca: "limpeza", page: 1 });
    await waitFor(() => expect(mocks.listar).toHaveBeenCalledTimes(3));

    await act(async () => {
      searchFirstPageRequest.resolve({ items: [] as never[], total: 1 });
      await searchFirstPageRequest.promise;
    });
    expect(result.current.total).toBe(1);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      searchOldPageRequest.resolve({ items: [] as never[], total: 20 });
      oldPageRequest.resolve({ items: [] as never[], total: 100 });
      await Promise.all([searchOldPageRequest.promise, oldPageRequest.promise]);
    });

    expect(result.current.total).toBe(1);
    expect(result.current.servicos).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
