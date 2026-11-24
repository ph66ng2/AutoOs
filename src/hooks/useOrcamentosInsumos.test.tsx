import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { OrcamentoInsumos } from "@/types";

const mockListar = vi.hoisted(() => vi.fn());
const mockContar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    listarOrcamentosInsumos: (...args: unknown[]) => mockListar(...args),
    contarOrcamentosInsumosPorStatus: (...args: unknown[]) => mockContar(...args),
  },
}));

import { precisaRecarregar, useOrcamentosInsumos } from "@/hooks/useOrcamentosInsumos";
import { distribuirMudancas } from "@/lib/ao-vivo";

const orcamento = (id: number, clienteId: number, nome: string, contatoId: number | null = null) =>
  ({ id, empresa_id: 1, numero: id, numero_exibicao: `OI-${id}`, cliente_id: clienteId, cliente_nome: nome, contato_id: contatoId, status: "RASCUNHO" }) as unknown as OrcamentoInsumos;

describe("useOrcamentosInsumos — atualização ao vivo", () => {
  beforeEach(() => {
    mockListar.mockReset();
    mockContar.mockReset();
    mockContar.mockResolvedValue({ RASCUNHO: 1 });
  });

  it("cliente alterado em outro computador recarrega em silêncio a busca por cliente/documento (lista e pílulas)", async () => {
    mockListar.mockResolvedValue({ items: [], total: 0 });
    const { result } = renderHook(() => useOrcamentosInsumos({ busca: "123.456.789-09" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orcamentos).toEqual([]);
    mockListar.mockClear();
    mockContar.mockClear();

    // O cliente 7 (fora da lista) passou a ter esse CPF: a venda dele tem de aparecer.
    const nova = orcamento(5, 7, "Maria");
    mockListar.mockResolvedValueOnce({ items: [nova], total: 1 });
    mockContar.mockResolvedValueOnce({ RASCUNHO: 1 });
    await act(async () => {
      distribuirMudancas([{ tabela: "clientes", id: 7, referencia: null, operacao: "U" }]);
    });
    await waitFor(() => expect(result.current.orcamentos).toEqual([nova]));
    expect(result.current.loading).toBe(false);
    expect(result.current.contagens).toEqual({ RASCUNHO: 1 });
    expect(mockListar).toHaveBeenCalledTimes(1);
    expect(mockListar.mock.calls[0][0]).toMatchObject({ busca: "123.456.789-09" });
    expect(mockListar.mock.calls[0][1]).toBe(true);
    expect(mockContar).toHaveBeenCalledWith("123.456.789-09", true);
  });

  it("sem busca, cliente ou contato fora da página não relê; cliente exibido relê", async () => {
    mockListar.mockResolvedValue({ items: [orcamento(1, 3, "Ana", 30)], total: 1 });
    const { result } = renderHook(() => useOrcamentosInsumos({}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockListar).toHaveBeenCalledTimes(1);

    await act(async () => {
      distribuirMudancas([
        { tabela: "clientes", id: 99, referencia: null, operacao: "U" },
        { tabela: "cliente_contatos", id: 98, referencia: 99, operacao: "U" },
      ]);
    });
    expect(mockListar).toHaveBeenCalledTimes(1);
    expect(mockContar).toHaveBeenCalledTimes(1);

    // O cliente da linha exibida foi renomeado: relê em silêncio.
    mockListar.mockResolvedValueOnce({ items: [orcamento(1, 3, "Ana Paula", 30)], total: 1 });
    await act(async () => {
      distribuirMudancas([{ tabela: "clientes", id: 3, referencia: null, operacao: "U" }]);
    });
    await waitFor(() => expect(result.current.orcamentos[0].cliente_nome).toBe("Ana Paula"));
    expect(mockListar.mock.calls.at(-1)?.[1]).toBe(true);
  });

  it("falha da recarga silenciosa mantém a lista e as pílulas, sem erro", async () => {
    const original = orcamento(1, 3, "Ana");
    mockListar.mockResolvedValueOnce({ items: [original], total: 1 }).mockRejectedValueOnce(new Error("sessão bloqueada"));
    const { result } = renderHook(() => useOrcamentosInsumos({ busca: "Ana" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orcamentos).toEqual([original]);

    await act(async () => {
      distribuirMudancas([{ tabela: "clientes", id: 3, referencia: null, operacao: "U" }]);
    });
    await waitFor(() => expect(mockListar).toHaveBeenCalledTimes(2));
    expect(mockListar.mock.calls[1][1]).toBe(true);
    expect(result.current.orcamentos).toEqual([original]);
    expect(result.current.total).toBe(1);
    expect(result.current.contagens).toEqual({ RASCUNHO: 1 });
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe("precisaRecarregar", () => {
  const exibidos = [orcamento(1, 3, "Ana", 30)];
  it("venda, reconexão ou busca sempre relê", () => {
    expect(precisaRecarregar([], undefined, exibidos)).toBe(true);
    expect(precisaRecarregar([{ tabela: "orcamentos_insumos", id: 50, referencia: null, operacao: "I" }], undefined, exibidos)).toBe(true);
    expect(precisaRecarregar([{ tabela: "clientes", id: 99, referencia: null, operacao: "U" }], " x ", exibidos)).toBe(true);
  });
  it("sem busca, só cliente/contato das linhas exibidas", () => {
    expect(precisaRecarregar([{ tabela: "clientes", id: 99, referencia: null, operacao: "U" }], "  ", exibidos)).toBe(false);
    expect(precisaRecarregar([{ tabela: "clientes", id: 3, referencia: null, operacao: "U" }], undefined, exibidos)).toBe(true);
    expect(precisaRecarregar([{ tabela: "cliente_contatos", id: 30, referencia: 99, operacao: "U" }], undefined, exibidos)).toBe(true);
    expect(precisaRecarregar([{ tabela: "cliente_contatos", id: 77, referencia: 3, operacao: "I" }], undefined, exibidos)).toBe(true);
    expect(precisaRecarregar([{ tabela: "cliente_contatos", id: 77, referencia: 99, operacao: "I" }], undefined, exibidos)).toBe(false);
  });
});
