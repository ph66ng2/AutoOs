import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listarServicosPaginados: vi.fn(),
  contarServicos: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks }));

import { distribuirMudancas } from "@/lib/ao-vivo";
import { useServicos } from "./useServicos";

it("descarta a lista e as contagens se a contagem ao vivo da busca antiga terminar por último", async () => {
  let resolver!: (contagem: { ativos: number; inativos: number }) => void;
  const antiga = new Promise<{ ativos: number; inativos: number }>((resolve) => {
    resolver = resolve;
  });
  mocks.contarServicos.mockResolvedValueOnce({ ativos: 1, inativos: 0 })
    .mockReturnValueOnce(antiga)
    .mockResolvedValueOnce({ ativos: 2, inativos: 1 });
  mocks.listarServicosPaginados.mockResolvedValueOnce({ items: [{ id: 1 }], total: 1 })
    .mockResolvedValueOnce({ items: [{ id: 2 }], total: 5 })
    .mockResolvedValueOnce({ items: [{ id: 3 }, { id: 4 }], total: 2 });

  const { result, rerender } = renderHook(({ busca }) => useServicos({ busca }), {
    initialProps: { busca: "limpeza" },
  });
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => distribuirMudancas([{ tabela: "servicos_catalogo", id: 2, referencia: null, operacao: "U" }]));
  expect(mocks.contarServicos).toHaveBeenLastCalledWith("limpeza", true);

  rerender({ busca: "instalação" });
  await waitFor(() => expect(result.current.contagem).toEqual({ ativos: 2, inativos: 1 }));

  await act(async () => resolver({ ativos: 5, inativos: 3 }));
  expect(result.current.servicos).toEqual([{ id: 3 }, { id: 4 }]);
  expect(result.current.total).toBe(2);
  expect(result.current.contagem).toEqual({ ativos: 2, inativos: 1 });
});
