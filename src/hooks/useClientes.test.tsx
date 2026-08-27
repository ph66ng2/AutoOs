import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Cliente } from "@/types";
import type { ClientesRepository } from "@/lib/data/clientes-repository";
import { useClientes } from "@/hooks/useClientes";

const cliente: Cliente = { id: "11111111-1111-4111-8111-111111111111", nome: "Ana", telefone: "11" };

function repository(overrides: Partial<ClientesRepository> = {}): ClientesRepository {
  return {
    listar: vi.fn().mockResolvedValue([cliente]),
    buscar: vi.fn().mockResolvedValue(cliente),
    criar: vi.fn().mockResolvedValue(cliente),
    atualizar: vi.fn().mockResolvedValue(cliente),
    deletar: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("useClientes — adapter de domínio", () => {
  it("usa o mesmo hook com o adapter Online e IDs UUID", async () => {
    const data = repository();
    const { result } = renderHook(() => useClientes({ repository: data }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.atualizar(cliente.id!, { nome: "Ana Atualizada", telefone: "11" }); });

    expect(data.atualizar).toHaveBeenCalledWith(cliente.id, { nome: "Ana Atualizada", telefone: "11" });
    expect(data.listar).toHaveBeenCalledTimes(2);
  });

  it("devolve um erro recuperável sem descartar o formulário", async () => {
    const data = repository({ criar: vi.fn().mockRejectedValue(new Error("Você está sem conexão")) });
    const { result } = renderHook(() => useClientes({ repository: data }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let response: Awaited<ReturnType<typeof result.current.criar>> | undefined;
    await act(async () => { response = await result.current.criar({ nome: "Ana", telefone: "11" }); });

    expect(response).toEqual({ sucesso: false, erro: "Error: Você está sem conexão" });
  });
});
