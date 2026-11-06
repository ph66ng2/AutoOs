import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useOrcamentosPendentesPortal } from "@/hooks/useOrcamentosPendentesPortal";

const mocks = vi.hoisted(() => ({ listar: vi.fn(), publicar: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    listarOrcamentosPendentesPortal: mocks.listar,
    publicarOrcamentosPendentesPortal: mocks.publicar,
  },
}));

const pendente = { equipamento_id: 7, descricao: "HP LaserJet - série ABC", prazo_aprovacao: "2026-11-10" };

describe("useOrcamentosPendentesPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("carrega os pendentes ao montar", async () => {
    mocks.listar.mockResolvedValue([pendente]);
    const { result } = renderHook(() => useOrcamentosPendentesPortal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pendentes).toEqual([pendente]);
    expect(result.current.error).toBeNull();
  });

  it("erro ao listar vira lista vazia mais error", async () => {
    mocks.listar.mockRejectedValue("Falha de conexão");
    const { result } = renderHook(() => useOrcamentosPendentesPortal());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.pendentes).toEqual([]);
    expect(result.current.error).toBe("Falha de conexão");
  });

  it("publicarTodos chama o db, recarrega a lista e devolve o resultado", async () => {
    mocks.listar.mockResolvedValueOnce([pendente]).mockResolvedValueOnce([]);
    const resultado = { publicados: [7], falhas: [] };
    mocks.publicar.mockResolvedValue(resultado);
    const { result } = renderHook(() => useOrcamentosPendentesPortal());
    await waitFor(() => expect(result.current.pendentes).toHaveLength(1));

    let devolvido: unknown;
    await act(async () => {
      devolvido = await result.current.publicarTodos();
    });

    expect(mocks.publicar).toHaveBeenCalledTimes(1);
    expect(mocks.listar).toHaveBeenCalledTimes(2);
    expect(devolvido).toEqual(resultado);
    expect(result.current.pendentes).toEqual([]);
  });

  it("publicarTodos com erro guarda error e repassa a exceção", async () => {
    mocks.listar.mockResolvedValue([pendente]);
    mocks.publicar.mockRejectedValue("Permissão insuficiente");
    const { result } = renderHook(() => useOrcamentosPendentesPortal());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await expect(result.current.publicarTodos()).rejects.toBe("Permissão insuficiente");
    });
    expect(result.current.error).toBe("Permissão insuficiente");
  });
});
