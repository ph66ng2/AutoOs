import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ obterOrcamentoInsumos: vi.fn(), marcarOrcamentoInsumosEntregue: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mocks }));

import { distribuirMudancas } from "@/lib/ao-vivo";
import { useVendaRetirada } from "./useVendaRetirada";

function adiada<T>() {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((res, rej) => { resolver = res; rejeitar = rej; });
  return { promessa, resolver, rejeitar };
}

const venda = (status = "APROVADO", id = 7) => ({ id, status, atualizado_em: `t-${status}`, itens: [] }) as never;
const mudanca = (tabela: string) => [{ tabela, id: 7, referencia: null, operacao: "U" }];

describe("useVendaRetirada", () => {
  beforeEach(() => {
    mocks.obterOrcamentoInsumos.mockReset();
    mocks.marcarOrcamentoInsumosEntregue.mockReset();
  });

  it("mudança ao vivo relê em segundo plano sem voltar ao carregamento", async () => {
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda("APROVADO"));
    const { result } = renderHook(() => useVendaRetirada(7));
    await waitFor(() => expect(result.current.venda?.status).toBe("APROVADO"));
    expect(mocks.obterOrcamentoInsumos).toHaveBeenLastCalledWith(7);

    const releitura = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockReturnValueOnce(releitura.promessa);
    act(() => distribuirMudancas(mudanca("orcamentos_insumos")));
    await waitFor(() => expect(mocks.obterOrcamentoInsumos).toHaveBeenLastCalledWith(7, true));
    expect(result.current.loading).toBe(false);
    expect(result.current.venda?.status).toBe("APROVADO");

    await act(async () => { releitura.resolver(venda("CANCELADO")); });
    expect(result.current.venda?.status).toBe("CANCELADO");
    expect(result.current.loading).toBe(false);
  });

  it("relê a venda quando o contato muda em outro computador (nome e telefone vêm de cliente_contatos)", async () => {
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda("APROVADO"));
    const { result } = renderHook(() => useVendaRetirada(7));
    await waitFor(() => expect(result.current.venda?.status).toBe("APROVADO"));
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce({ ...(venda("APROVADO") as object), contato_telefone: "71999990000" } as never);
    await act(async () => { distribuirMudancas([{ tabela: "cliente_contatos", id: 3, referencia: 4, operacao: "U" }]); });
    await waitFor(() => expect(mocks.obterOrcamentoInsumos).toHaveBeenLastCalledWith(7, true));
    await waitFor(() => expect((result.current.venda as unknown as { contato_telefone?: string }).contato_telefone).toBe("71999990000"));
  });

  it("falha da recarga silenciosa mantém a venda e não mostra erro", async () => {
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda("APROVADO")).mockRejectedValueOnce("Acesso sensível bloqueado.");
    const { result } = renderHook(() => useVendaRetirada(7));
    await waitFor(() => expect(result.current.venda?.status).toBe("APROVADO"));
    await act(async () => { distribuirMudancas(mudanca("orcamentos_insumos")); });
    await waitFor(() => expect(mocks.obterOrcamentoInsumos).toHaveBeenCalledTimes(2));
    expect(result.current.error).toBeNull();
    expect(result.current.venda?.status).toBe("APROVADO");
  });

  it("descarta a resposta antiga que chega depois de uma mais nova", async () => {
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda("APROVADO"));
    const { result } = renderHook(() => useVendaRetirada(7));
    await waitFor(() => expect(result.current.venda).not.toBeNull());

    const antiga = adiada<unknown>();
    const nova = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockReturnValueOnce(antiga.promessa).mockReturnValueOnce(nova.promessa);
    act(() => distribuirMudancas(mudanca("orcamentos_insumos")));
    act(() => distribuirMudancas(mudanca("clientes")));
    await waitFor(() => expect(mocks.obterOrcamentoInsumos).toHaveBeenCalledTimes(3));

    await act(async () => { nova.resolver(venda("ENTREGUE")); });
    await act(async () => { antiga.resolver(venda("APROVADO")); });
    expect(result.current.venda?.status).toBe("ENTREGUE");
  });

  it("mudança durante a carga visível vira uma releitura silenciosa depois dela", async () => {
    const primeira = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockReturnValueOnce(primeira.promessa).mockResolvedValueOnce(venda("CANCELADO"));
    const { result } = renderHook(() => useVendaRetirada(7));
    act(() => distribuirMudancas(mudanca("orcamentos_insumos")));
    expect(mocks.obterOrcamentoInsumos).toHaveBeenCalledTimes(1);

    await act(async () => { primeira.resolver(venda("APROVADO")); });
    await waitFor(() => expect(result.current.venda?.status).toBe("CANCELADO"));
    expect(mocks.obterOrcamentoInsumos).toHaveBeenLastCalledWith(7, true);
  });

  it("recarga ao vivo atrasada não desfaz a entrega feita aqui", async () => {
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda("APROVADO"));
    const { result } = renderHook(() => useVendaRetirada(7));
    await waitFor(() => expect(result.current.venda?.status).toBe("APROVADO"));

    const atrasada = adiada<unknown>();
    mocks.obterOrcamentoInsumos.mockReturnValueOnce(atrasada.promessa);
    act(() => distribuirMudancas(mudanca("produtos")));
    await waitFor(() => expect(mocks.obterOrcamentoInsumos).toHaveBeenCalledTimes(2));

    mocks.marcarOrcamentoInsumosEntregue.mockResolvedValueOnce(venda("ENTREGUE"));
    let falha: string | null = "x";
    await act(async () => { falha = await result.current.entregar(); });
    expect(falha).toBeNull();
    expect(mocks.marcarOrcamentoInsumosEntregue).toHaveBeenCalledWith(7, "t-APROVADO");

    await act(async () => { atrasada.resolver(venda("APROVADO")); });
    expect(result.current.venda?.status).toBe("ENTREGUE");
  });

  it("entrega recusada (conflito) relê a venda em silêncio para mostrar o status atual", async () => {
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda("APROVADO")).mockResolvedValueOnce(venda("CANCELADO"));
    const { result } = renderHook(() => useVendaRetirada(7));
    await waitFor(() => expect(result.current.venda?.status).toBe("APROVADO"));

    mocks.marcarOrcamentoInsumosEntregue.mockRejectedValueOnce("Conflito de concorrência");
    let falha: string | null = null;
    await act(async () => { falha = await result.current.entregar(); });
    expect(falha).toBe("Conflito de concorrência");
    await waitFor(() => expect(result.current.venda?.status).toBe("CANCELADO"));
    expect(mocks.obterOrcamentoInsumos).toHaveBeenLastCalledWith(7, true);
    expect(result.current.loading).toBe(false);
  });
});
