import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Equipamento } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { db } from "@/lib/db";

describe("db — equipamentos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("criarEquipamento envia payload em `input` (contrato Rust)", async () => {
    const payload: Omit<Equipamento, "id"> = {
      serial_number: "SN-UNIT-001",
      marca: "HP",
      modelo: "M404",
      tipo: "IMPRESSORA",
      status: "RECEBIDO",
      defeito_relatado: "Teste",
      data_entrada: "2026-05-05",
      cliente_id: 7,
      cliente_nome: "Cliente Unit",
      cliente_telefone: "11987654321",
      cliente_email: "c@example.com",
    };
    mockInvoke.mockResolvedValue({ ...payload, id: 42 });

    const out = await db.criarEquipamento(payload);

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith("criar_equipamento", { input: payload });
    expect(out.id).toBe(42);
    expect(out.serial_number).toBe("SN-UNIT-001");
  });

  it("atualizarEquipamento passa id e input", async () => {
    const payload: Omit<Equipamento, "id"> = {
      serial_number: "SN-002",
      marca: "Canon",
      modelo: "MF644",
      tipo: "LASER",
      status: "RECEBIDO",
      defeito_relatado: "x",
      data_entrada: "2026-05-05",
    };
    mockInvoke.mockResolvedValue({ ...payload, id: 3 });

    await db.atualizarEquipamento(3, payload);

    expect(mockInvoke).toHaveBeenCalledWith("atualizar_equipamento", { id: 3, input: payload });
  });
});
