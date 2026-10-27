import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Equipamento } from "@/types";

const mockListarPaginados = vi.hoisted(() => vi.fn());
const mockCriar = vi.hoisted(() => vi.fn());
const mockAtualizar = vi.hoisted(() => vi.fn());
const mockDeletar = vi.hoisted(() => vi.fn());
const mockAtualizarStatus = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    listarEquipamentosPaginados: (...args: unknown[]) => mockListarPaginados(...args),
    criarEquipamento: (...args: unknown[]) => mockCriar(...args),
    atualizarEquipamento: (...args: unknown[]) => mockAtualizar(...args),
    deletarEquipamento: (...args: unknown[]) => mockDeletar(...args),
    atualizarStatusEquipamento: (...args: unknown[]) => mockAtualizarStatus(...args),
  },
}));

import { useEquipamentos } from "@/hooks/useEquipamentos";

const novoEquipamento: Omit<Equipamento, "id"> = {
  serial_number: "SN-HOOK-1",
  marca: "HP",
  modelo: "4004",
  tipo: "LASER",
  status: "RECEBIDO",
  defeito_relatado: "Falha de toner",
  data_entrada: "2026-05-05",
  cliente_id: 1,
  cliente_nome: "Cliente Hook",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const equipamentoBase: Equipamento = { ...novoEquipamento, id: 1 };

describe("useEquipamentos — registro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListarPaginados.mockResolvedValue({ items: [], total: 0 });
    mockAtualizar.mockResolvedValue(equipamentoBase);
    mockDeletar.mockResolvedValue(undefined);
    mockAtualizarStatus.mockResolvedValue(equipamentoBase);
  });

  it("criar chama db.criarEquipamento e recarrega a lista", async () => {
    const persistido: Equipamento = { ...novoEquipamento, id: 100 };
    let lista: Equipamento[] = [];

    mockListarPaginados.mockImplementation(async () => ({ items: [...lista], total: lista.length }));
    mockCriar.mockImplementation(async (payload: Omit<Equipamento, "id">) => {
      lista = [{ ...payload, id: persistido.id }];
      return lista[0]!;
    });

    const { result } = renderHook(() => useEquipamentos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let out: Awaited<ReturnType<typeof result.current.criar>> | undefined;

    await act(async () => {
      out = await result.current.criar(novoEquipamento);
    });

    expect(out).toEqual({ sucesso: true, data: persistido, recargaSucesso: true });
    expect(mockCriar).toHaveBeenCalledTimes(1);
    expect(mockCriar).toHaveBeenCalledWith(novoEquipamento);
    await waitFor(() => {
      expect(result.current.equipamentos).toEqual([persistido]);
    });
  });

  it("criar devolve erro quando backend falha", async () => {
    mockCriar.mockRejectedValue(new Error("duplicado"));

    const { result } = renderHook(() => useEquipamentos());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let out: Awaited<ReturnType<typeof result.current.criar>> | undefined;

    await act(async () => {
      out = await result.current.criar(novoEquipamento);
    });

    expect(out?.sucesso).toBe(false);
    expect(String(out?.erro)).toContain("duplicado");
  });

  it("envia a ordenação escolhida ao banco ao trocar a visualização", async () => {
    const { rerender } = renderHook(
      ({ ordenacao }: { ordenacao: "ATUALIZACAO_RECENTE" | "CADASTRO_RECENTE" }) =>
        useEquipamentos({ page: 2, ordenacao }),
      { initialProps: { ordenacao: "ATUALIZACAO_RECENTE" as const } },
    );

    await waitFor(() => {
      expect(mockListarPaginados).toHaveBeenCalledWith(undefined, undefined, 1, "ATUALIZACAO_RECENTE");
    });

    rerender({ ordenacao: "CADASTRO_RECENTE" });
    await waitFor(() => {
      expect(mockListarPaginados).toHaveBeenCalledWith(undefined, undefined, 1, "CADASTRO_RECENTE");
    });
  });

  it("ignora erro e finally da busca antiga quando o filtro muda", async () => {
    const antiga = deferred<{ items: Equipamento[]; total: number }>();
    const nova = deferred<{ items: Equipamento[]; total: number }>();
    mockListarPaginados
      .mockReturnValueOnce(antiga.promise)
      .mockReturnValueOnce(nova.promise);

    const { result, rerender } = renderHook(
      ({ busca }: { busca: string }) => useEquipamentos({ busca }),
      { initialProps: { busca: "antiga" } },
    );

    await waitFor(() => expect(mockListarPaginados).toHaveBeenCalledTimes(1));
    rerender({ busca: "nova" });
    await waitFor(() => expect(mockListarPaginados).toHaveBeenCalledTimes(2));

    await act(async () => {
      antiga.reject(new Error("falha antiga"));
      await antiga.promise.catch(() => undefined);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.equipamentos).toEqual([]);

    await act(async () => {
      nova.resolve({ items: [equipamentoBase], total: 1 });
      await nova.promise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.equipamentos).toEqual([equipamentoBase]);
    expect(result.current.total).toBe(1);
  });

  it("mantém a tabela e loading desligado durante a recarga silenciosa da mutação", async () => {
    const recarga = deferred<{ items: Equipamento[]; total: number }>();
    mockListarPaginados
      .mockResolvedValueOnce({ items: [equipamentoBase], total: 1 })
      .mockReturnValueOnce(recarga.promise);

    const { result } = renderHook(() => useEquipamentos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let mutacao!: ReturnType<typeof result.current.atualizar>;
    await act(async () => {
      mutacao = result.current.atualizar(1, novoEquipamento);
      await Promise.resolve();
    });

    await waitFor(() => expect(mockListarPaginados).toHaveBeenCalledTimes(2));
    expect(result.current.loading).toBe(false);
    expect(result.current.equipamentos).toEqual([equipamentoBase]);

    await act(async () => {
      recarga.resolve({ items: [{ ...equipamentoBase, modelo: "Atualizado" }], total: 1 });
      await mutacao;
    });

    expect(result.current.equipamentos[0]?.modelo).toBe("Atualizado");
  });

  it("preserva sucesso da escrita e expõe falha da recarga sem perder a lista", async () => {
    mockListarPaginados
      .mockResolvedValueOnce({ items: [equipamentoBase], total: 1 })
      .mockRejectedValueOnce(new Error("falha ao recarregar"));

    const { result } = renderHook(() => useEquipamentos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let out: Awaited<ReturnType<typeof result.current.atualizar>> | undefined;
    await act(async () => {
      out = await result.current.atualizar(1, novoEquipamento);
    });

    expect(out).toEqual({
      sucesso: true,
      data: equipamentoBase,
      recargaSucesso: false,
      avisoAtualizacao: "falha ao recarregar",
    });
    expect(result.current.error).toBe("falha ao recarregar");
    expect(result.current.equipamentos).toEqual([equipamentoBase]);
    expect(result.current.loading).toBe(false);
  });

  it("não deixa a recarga obsoleta sobrescrever o aviso da gravação mais recente", async () => {
    const recargaAntiga = deferred<{ items: Equipamento[]; total: number }>();
    mockListarPaginados
      .mockResolvedValueOnce({ items: [equipamentoBase], total: 1 })
      .mockReturnValueOnce(recargaAntiga.promise)
      .mockRejectedValueOnce(new Error("falha da gravação mais recente"));
    const { result } = renderHook(() => useEquipamentos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let primeiraMutacao!: ReturnType<typeof result.current.atualizar>;
    await act(async () => {
      primeiraMutacao = result.current.atualizar(1, novoEquipamento);
      await Promise.resolve();
    });
    await waitFor(() => expect(mockListarPaginados).toHaveBeenCalledTimes(2));

    await act(async () => {
      await result.current.atualizar(1, novoEquipamento);
    });
    expect(result.current.avisoAtualizacao).toBe("falha da gravação mais recente");

    await act(async () => {
      recargaAntiga.reject(new Error("falha obsoleta"));
      await primeiraMutacao;
    });
    expect(result.current.error).toBe("falha da gravação mais recente");
    expect(result.current.avisoAtualizacao).toBe("falha da gravação mais recente");
  });

  it("não inicia recarga nem publica resultado de mutação após desmontar", async () => {
    const escrita = deferred<Equipamento>();
    mockAtualizar.mockReturnValue(escrita.promise);

    const { result, unmount } = renderHook(() => useEquipamentos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let mutacao!: ReturnType<typeof result.current.atualizar>;
    await act(async () => {
      mutacao = result.current.atualizar(1, novoEquipamento);
      await Promise.resolve();
    });
    unmount();

    escrita.resolve(equipamentoBase);
    await expect(mutacao).resolves.toMatchObject({ sucesso: true, recargaSucesso: false });
    expect(mockListarPaginados).toHaveBeenCalledTimes(1);
  });

  it("mantém o token de concorrência ao atualizar o status", async () => {
    const { result } = renderHook(() => useEquipamentos());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.atualizarStatus(
        1,
        "EM_VERIFICACAO",
        undefined,
        undefined,
        undefined,
        "2026-10-27T10:00:00Z",
        "Correção solicitada",
      );
    });

    expect(mockAtualizarStatus).toHaveBeenCalledWith(
      1,
      "EM_VERIFICACAO",
      undefined,
      undefined,
      undefined,
      "2026-10-27T10:00:00Z",
      "Correção solicitada",
    );
  });
});
