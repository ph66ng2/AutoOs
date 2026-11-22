import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const buscarCliente = vi.hoisted(() => vi.fn());
const listarEquipamentosCliente = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { buscarCliente, listarEquipamentosCliente } }));

import { useHistoricoEquipamentosCliente } from "@/hooks/useHistoricoEquipamentosCliente";

function adiado<T>() {
  let resolver: (valor: T) => void = () => undefined;
  let rejeitar: (erro: unknown) => void = () => undefined;
  const promessa = new Promise<T>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
}

const equipamento = (id: number, cliente: string) => ({ id, cliente, marca: "HP", modelo: `M${id}`, serial_number: `S${id}`, status: "RECEBIDO" });

describe("useHistoricoEquipamentosCliente", () => {
  beforeEach(() => {
    buscarCliente.mockReset();
    listarEquipamentosCliente.mockReset();
    buscarCliente.mockImplementation(async (id: number) => ({ id, nome: `Cliente ${id}` }));
  });

  it("resposta atrasada do cliente anterior não mostra os aparelhos dele", async () => {
    const lento = adiado<unknown[]>();
    listarEquipamentosCliente.mockImplementation((id: number) =>
      id === 1 ? lento.promessa : Promise.resolve([equipamento(20, "Cliente 2")]),
    );
    const { result, rerender } = renderHook(({ id }) => useHistoricoEquipamentosCliente(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(listarEquipamentosCliente).toHaveBeenCalledWith(1, expect.anything()));

    rerender({ id: 2 });
    await waitFor(() => expect(result.current.cliente?.id).toBe(2));
    expect(result.current.totalOs).toBe(1);
    expect(result.current.loading).toBe(false);

    lento.resolver([equipamento(10, "Cliente 1"), equipamento(11, "Cliente 1")]);
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.cliente?.id).toBe(2);
    expect(result.current.totalOs).toBe(1);
  });

  it("erro atrasado do cliente anterior não aparece nem mexe no carregando", async () => {
    const lento = adiado<unknown[]>();
    const segundo = adiado<unknown[]>();
    listarEquipamentosCliente.mockImplementation((id: number) => (id === 1 ? lento.promessa : segundo.promessa));
    const { result, rerender } = renderHook(({ id }) => useHistoricoEquipamentosCliente(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(listarEquipamentosCliente).toHaveBeenCalledTimes(1));
    rerender({ id: 2 });
    await waitFor(() => expect(listarEquipamentosCliente).toHaveBeenCalledTimes(2));

    lento.rejeitar(new Error("falhou o 1"));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);

    segundo.resolver([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it("trocar de cliente limpa a lista na hora", async () => {
    listarEquipamentosCliente.mockResolvedValueOnce([equipamento(10, "Cliente 1")]);
    const { result, rerender } = renderHook(({ id }) => useHistoricoEquipamentosCliente(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(result.current.totalOs).toBe(1));

    listarEquipamentosCliente.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ id: 2 });
    expect(result.current.totalOs).toBe(0);
    expect(result.current.cliente).toBeNull();
  });
});
