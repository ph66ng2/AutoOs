import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useContagemClientes } from "@/hooks/usePainelClientes";
import { distribuirMudancas } from "@/lib/ao-vivo";

const contarClientesPorFiltro = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { contarClientesPorFiltro } }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));

it("atualiza a contagem após recarga manual e eventos de clientes, OS e contatos", async () => {
  contarClientesPorFiltro.mockResolvedValue({ todos: 1 });
  const { result } = renderHook(() => useContagemClientes("Ana"));
  await waitFor(() => expect(result.current.data).toEqual({ todos: 1 }));

  contarClientesPorFiltro.mockResolvedValue({ todos: 2 });
  await act(() => result.current.recarregar());
  expect(contarClientesPorFiltro).toHaveBeenLastCalledWith("Ana", false);
  expect(result.current.data).toEqual({ todos: 2 });

  for (const [tabela, todos] of [["clientes", 3], ["equipamentos", 4], ["cliente_contatos", 5]] as const) {
    contarClientesPorFiltro.mockResolvedValue({ todos });
    act(() => distribuirMudancas([{ tabela, id: 1, referencia: null, operacao: "U" }]));
    await waitFor(() => expect(result.current.data).toEqual({ todos }));
    expect(contarClientesPorFiltro).toHaveBeenLastCalledWith("Ana", true);
  }
});

it("descarta resposta atrasada e recarrega com a busca atual", async () => {
  let responder!: (valor: unknown) => void;
  contarClientesPorFiltro
    .mockReturnValueOnce(new Promise((resolve) => { responder = resolve; }))
    .mockResolvedValue({ todos: 2 });
  const { result, rerender } = renderHook(({ busca }) => useContagemClientes(busca), {
    initialProps: { busca: "Ana" },
  });
  const recarregar = result.current.recarregar;
  rerender({ busca: "Bia" });
  await act(() => recarregar());
  expect(contarClientesPorFiltro).toHaveBeenLastCalledWith("Bia", false);

  await act(async () => responder({ todos: 1 }));
  expect(result.current.data).toEqual({ todos: 2 });
});


it("preserva a contagem da nova busca quando um evento chega durante a carga", async () => {
  let responder!: (valor: { todos: number }) => void;
  const pendente = new Promise<{ todos: number }>((resolve) => { responder = resolve; });
  contarClientesPorFiltro.mockClear().mockImplementation((busca, segundoPlano) => {
    if (segundoPlano) return Promise.resolve({ todos: 99 });
    return busca === "Bia" ? pendente : Promise.resolve({ todos: 1 });
  });
  const { result, rerender } = renderHook(({ busca }) => useContagemClientes(busca), {
    initialProps: { busca: "Ana" },
  });
  await waitFor(() => expect(result.current.data).toEqual({ todos: 1 }));

  rerender({ busca: "Bia" });
  expect(contarClientesPorFiltro).toHaveBeenLastCalledWith("Bia", false);
  await act(async () => distribuirMudancas([{ tabela: "clientes", id: 1, referencia: null, operacao: "U" }]));
  expect(contarClientesPorFiltro).toHaveBeenCalledTimes(2);

  await act(async () => responder({ todos: 2 }));
  // A carga visível pode ter lido antes do COMMIT remoto: uma única recarga silenciosa vem depois.
  await waitFor(() => expect(result.current.data).toEqual({ todos: 99 }));
  expect(contarClientesPorFiltro).toHaveBeenCalledTimes(3);
  expect(contarClientesPorFiltro).toHaveBeenLastCalledWith("Bia", true);
});
