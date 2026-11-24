import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const buscarCliente = vi.hoisted(() => vi.fn());
const listarHistoricoEquipamentosCliente = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ db: { buscarCliente, listarHistoricoEquipamentosCliente } }));

import { distribuirMudancas } from "@/lib/ao-vivo";
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
    listarHistoricoEquipamentosCliente.mockReset();
    buscarCliente.mockImplementation(async (id: number) => ({ id, nome: `Cliente ${id}` }));
  });

  it("preserva a carga inicial quando chega uma recarga ao vivo", async () => {
    const inicial = adiado<unknown[]>();
    listarHistoricoEquipamentosCliente.mockReturnValueOnce(inicial.promessa)
      .mockRejectedValue(new Error("Acesso sensível bloqueado"));
    const { result } = renderHook(() => useHistoricoEquipamentosCliente(1));
    await waitFor(() => expect(listarHistoricoEquipamentosCliente).toHaveBeenCalledTimes(1));

    await act(async () => distribuirMudancas([{ tabela: "equipamentos", id: 10, referencia: null, operacao: "U" }]));
    expect(buscarCliente).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    await act(async () => inicial.resolver([equipamento(10, "Cliente 1")]));
    expect(result.current.cliente?.id).toBe(1);
    expect(result.current.totalOs).toBe(1);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("atualiza o cliente e as passagens sem esconder o histórico", async () => {
    const pendente = adiado<unknown[]>();
    listarHistoricoEquipamentosCliente.mockResolvedValueOnce([equipamento(10, "Cliente 1")])
      .mockReturnValueOnce(pendente.promessa);
    const { result } = renderHook(() => useHistoricoEquipamentosCliente(1));
    await waitFor(() => expect(result.current.totalOs).toBe(1));

    act(() => distribuirMudancas([{ tabela: "equipamentos", id: 11, referencia: null, operacao: "I" }]));
    await waitFor(() => expect(listarHistoricoEquipamentosCliente).toHaveBeenLastCalledWith(1, ["Cliente 1", "Cliente 1"], true));
    expect(buscarCliente).toHaveBeenLastCalledWith(1, true);
    expect(result.current.loading).toBe(false);
    expect(result.current.totalOs).toBe(1);

    buscarCliente.mockResolvedValueOnce({ id: 1, nome: "Nome atualizado" });
    listarHistoricoEquipamentosCliente.mockResolvedValueOnce([equipamento(20, "Nome atualizado")]);
    act(() => distribuirMudancas([{ tabela: "clientes", id: 1, referencia: null, operacao: "U" }]));
    await waitFor(() => expect(result.current.cliente?.nome).toBe("Nome atualizado"));
    expect(listarHistoricoEquipamentosCliente).toHaveBeenLastCalledWith(1, ["Nome atualizado", "Nome atualizado"], true);

    await act(async () => pendente.resolver([equipamento(10, "Cliente 1"), equipamento(11, "Cliente 1")]));
    expect(result.current.totalOs).toBe(1);
    expect(result.current.aparelhos[0]?.passagens[0]?.id).toBe(20);
  });

  it("resposta atrasada do cliente anterior não mostra os aparelhos dele", async () => {
    const lento = adiado<unknown[]>();
    listarHistoricoEquipamentosCliente.mockImplementation((id: number) =>
      id === 1 ? lento.promessa : Promise.resolve([equipamento(20, "Cliente 2")]),
    );
    const { result, rerender } = renderHook(({ id }) => useHistoricoEquipamentosCliente(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(listarHistoricoEquipamentosCliente).toHaveBeenCalledWith(1, expect.anything()));

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
    listarHistoricoEquipamentosCliente.mockImplementation((id: number) => (id === 1 ? lento.promessa : segundo.promessa));
    const { result, rerender } = renderHook(({ id }) => useHistoricoEquipamentosCliente(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(listarHistoricoEquipamentosCliente).toHaveBeenCalledTimes(1));
    rerender({ id: 2 });
    await waitFor(() => expect(listarHistoricoEquipamentosCliente).toHaveBeenCalledTimes(2));

    lento.rejeitar(new Error("falhou o 1"));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(true);

    segundo.resolver([]);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  it("conta todas as OS do histórico, mesmo acima de 200", async () => {
    const lista = Array.from({ length: 250 }, (_, i) => ({ ...equipamento(300 - i, "Cliente 1"), serial_number: i < 249 ? "S-REPETIDO" : "S-ANTIGO" }));
    listarHistoricoEquipamentosCliente.mockResolvedValueOnce(lista);
    const { result } = renderHook(() => useHistoricoEquipamentosCliente(1));
    await waitFor(() => expect(result.current.totalOs).toBe(250));
    expect(listarHistoricoEquipamentosCliente).toHaveBeenCalledWith(1, ["Cliente 1", "Cliente 1"]);
    expect(result.current.aparelhos).toHaveLength(2);
  });

  it("trocar de cliente limpa a lista na hora", async () => {
    listarHistoricoEquipamentosCliente.mockResolvedValueOnce([equipamento(10, "Cliente 1")]);
    const { result, rerender } = renderHook(({ id }) => useHistoricoEquipamentosCliente(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(result.current.totalOs).toBe(1));

    listarHistoricoEquipamentosCliente.mockReturnValueOnce(new Promise(() => undefined));
    rerender({ id: 2 });
    expect(result.current.totalOs).toBe(0);
    expect(result.current.cliente).toBeNull();
  });
});
