import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { Equipamento } from "@/types";

const mockListar = vi.hoisted(() => vi.fn());
const mockCriar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    listarEquipamentos: (...args: unknown[]) => mockListar(...args),
    criarEquipamento: (...args: unknown[]) => mockCriar(...args),
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

describe("useEquipamentos — registro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListar.mockResolvedValue([]);
  });

  it("criar chama db.criarEquipamento e recarrega a lista", async () => {
    const persistido: Equipamento = { ...novoEquipamento, id: 100 };
    let lista: Equipamento[] = [];

    mockListar.mockImplementation(async () => [...lista]);
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

    expect(out).toEqual({ sucesso: true, data: persistido });
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
});
