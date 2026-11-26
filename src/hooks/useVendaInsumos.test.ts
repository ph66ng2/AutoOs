import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ obterOrcamentoInsumos: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { obterOrcamentoInsumos: mocks.obterOrcamentoInsumos } }));

import { distribuirMudancas } from "@/lib/ao-vivo";
import { useVendaInsumos } from "./useVendaInsumos";

function adiada<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
}

const venda = (id: number, status = "RASCUNHO") => ({ id, status, itens: [] }) as never;
const mudanca = (tabela: string) => [{ tabela, id: 1, referencia: null, operacao: "U" }];

describe("useVendaInsumos", () => {
  beforeEach(() => mocks.obterOrcamentoInsumos.mockReset());

  it("descarta a resposta do id anterior que chega depois da troca de rota", async () => {
    const primeira = adiada<unknown>();
    const segunda = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockImplementation((id: number) => (id === 1 ? primeira.promessa : segunda.promessa));
    const { result, rerender } = renderHook(({ id }) => useVendaInsumos(id), { initialProps: { id: 1 } });

    rerender({ id: 2 });
    await act(async () => { segunda.resolver(venda(2)); });
    await waitFor(() => expect(result.current.venda?.id).toBe(2));

    await act(async () => { primeira.resolver(venda(1)); });
    expect(result.current.venda?.id).toBe(2);
    expect(result.current.loading).toBe(false);
  });

  it("erro atrasado do id anterior não aparece no orçamento atual", async () => {
    const primeira = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockImplementation((id: number) => (id === 1 ? primeira.promessa : Promise.resolve(venda(2))));
    const { result, rerender } = renderHook(({ id }) => useVendaInsumos(id), { initialProps: { id: 1 } });
    rerender({ id: 2 });
    await waitFor(() => expect(result.current.venda?.id).toBe(2));
    await act(async () => { primeira.rejeitar("falhou"); });
    expect(result.current.error).toBeNull();
    expect(result.current.venda?.id).toBe(2);
  });

  it("não expõe o orçamento anterior enquanto o novo id carrega", async () => {
    const segunda = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockImplementation((id: number) => (id === 1 ? Promise.resolve(venda(1)) : segunda.promessa));
    const { result, rerender } = renderHook(({ id }) => useVendaInsumos(id), { initialProps: { id: 1 } });
    await waitFor(() => expect(result.current.venda?.id).toBe(1));

    rerender({ id: 2 });
    expect(result.current.venda).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => { segunda.resolver(venda(2)); });
    await waitFor(() => expect(result.current.venda?.id).toBe(2));
  });

  it("recarrega em silêncio quando outro computador muda o orçamento, o estoque, o cliente ou o contato", async () => {
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda(1));
    const { result } = renderHook(() => useVendaInsumos(1));
    await waitFor(() => expect(result.current.venda?.id).toBe(1));
    expect(mocks.obterOrcamentoInsumos).toHaveBeenLastCalledWith(1);

    const pendente = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockReturnValueOnce(pendente.promessa);
    act(() => distribuirMudancas(mudanca("orcamentos_insumos")));
    await waitFor(() => expect(mocks.obterOrcamentoInsumos).toHaveBeenLastCalledWith(1, true));
    expect(result.current.loading).toBe(false);
    expect(result.current.venda).not.toBeNull();

    await act(async () => { pendente.resolver(venda(1, "APROVADO")); });
    expect((result.current.venda as unknown as { status: string }).status).toBe("APROVADO");

    // O contato (nome, e-mail, telefone) vem de cliente_contatos, que muda sem mexer na venda.
    for (const tabela of ["produtos", "clientes", "cliente_contatos"]) {
      mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda(1));
      const antes = mocks.obterOrcamentoInsumos.mock.calls.length;
      await act(async () => distribuirMudancas(mudanca(tabela)));
      expect(mocks.obterOrcamentoInsumos.mock.calls.length).toBe(antes + 1);
    }
  });

  it("falha da recarga silenciosa mantém o orçamento; sucesso depois limpa o erro", async () => {
    mocks.obterOrcamentoInsumos.mockRejectedValueOnce("Sem conexão");
    const { result } = renderHook(() => useVendaInsumos(1));
    await waitFor(() => expect(result.current.error).toBe("Sem conexão"));

    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda(1));
    await act(async () => distribuirMudancas(mudanca("orcamentos_insumos")));
    await waitFor(() => expect(result.current.venda?.id).toBe(1));
    expect(result.current.error).toBeNull();

    mocks.obterOrcamentoInsumos.mockRejectedValueOnce("Acesso sensível bloqueado");
    await act(async () => distribuirMudancas(mudanca("orcamentos_insumos")));
    expect(result.current.error).toBeNull();
    expect(result.current.venda?.id).toBe(1);
  });

  it("mudança durante a carga visível espera e recarrega depois", async () => {
    const inicial = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockReturnValueOnce(inicial.promessa).mockResolvedValueOnce(venda(1, "CANCELADO"));
    const { result } = renderHook(() => useVendaInsumos(1));
    await waitFor(() => expect(mocks.obterOrcamentoInsumos).toHaveBeenCalledTimes(1));

    act(() => distribuirMudancas(mudanca("orcamentos_insumos")));
    expect(mocks.obterOrcamentoInsumos).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    await act(async () => { inicial.resolver(venda(1)); });
    await waitFor(() => expect(mocks.obterOrcamentoInsumos).toHaveBeenCalledTimes(2));
    expect(mocks.obterOrcamentoInsumos).toHaveBeenLastCalledWith(1, true);
    await waitFor(() => expect((result.current.venda as unknown as { status: string }).status).toBe("CANCELADO"));
    expect(result.current.loading).toBe(false);
  });
});
