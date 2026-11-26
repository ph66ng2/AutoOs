import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { usePecasBaixaPendente } from "@/hooks/usePecasBaixaPendente";

const listarPecasBaixaPendente = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { listarPecasBaixaPendente } }));

const peca = { servico_id: "s1", produto_id: 2 };

it("atualiza os selos da mesma OS em segundo plano e mantém a recarga manual normal", async () => {
  listarPecasBaixaPendente.mockResolvedValue([peca]);
  const { result } = renderHook(() => usePecasBaixaPendente(1));
  await waitFor(() => expect(result.current.pendentes.has("s1:2")).toBe(true));
  expect(listarPecasBaixaPendente).toHaveBeenLastCalledWith(1, false);

  listarPecasBaixaPendente.mockResolvedValue([]);
  await act(() => result.current.recarregar(true));
  expect(result.current.pendentes.size).toBe(0);
  expect(listarPecasBaixaPendente).toHaveBeenLastCalledWith(1, true);

  listarPecasBaixaPendente.mockResolvedValue([peca]);
  await act(() => result.current.recarregar());
  expect(result.current.pendentes.has("s1:2")).toBe(true);
  expect(listarPecasBaixaPendente).toHaveBeenLastCalledWith(1, false);
});

it("descarta respostas atrasadas da mesma OS e de outra OS", async () => {
  listarPecasBaixaPendente.mockResolvedValueOnce([peca]).mockResolvedValue([]);
  const { result, rerender } = renderHook(({ id }) => usePecasBaixaPendente(id), {
    initialProps: { id: 1 },
  });
  await waitFor(() => expect(result.current.pendentes.has("s1:2")).toBe(true));
  let responder!: (linhas: typeof peca[]) => void;

  const atrasarRecarga = () => {
    listarPecasBaixaPendente.mockReturnValueOnce(new Promise((resolve) => { responder = resolve; }));
    void result.current.recarregar(true);
  };

  atrasarRecarga();
  await act(() => result.current.recarregar());
  await act(async () => responder([peca]));
  expect(result.current.pendentes.size).toBe(0);

  atrasarRecarga();
  rerender({ id: 2 });
  await act(async () => responder([peca]));
  expect(result.current.pendentes.size).toBe(0);
  expect(listarPecasBaixaPendente).toHaveBeenLastCalledWith(2, false);
});
