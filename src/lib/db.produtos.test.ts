import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Produto } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { db } from "@/lib/db";

const payload: Omit<Produto, "id"> = {
  codigo: "RIB-CERA-110X450",
  nome: "RIBBON CERA 110X450",
  categoria: "CARTUCHO",
  quantidade_estoque: 1,
  quantidade_minima: 2,
  preco_custo: 78,
  preco_venda: 78,
  atualizado_em: "2026-09-18 07:00:00",
};

describe("db — produtos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("criarProduto envia payload em `input` (contrato Rust)", async () => {
    mockInvoke.mockResolvedValue({ ...payload, id: 5 });

    const created = await db.criarProduto(payload);

    expect(mockInvoke).toHaveBeenCalledWith("criar_produto", { input: payload });
    expect(created.id).toBe(5);
  });

  it("atualizarProduto passa id e input", async () => {
    mockInvoke.mockResolvedValue({ ...payload, id: 5, categoria: "CARTUCHO" });

    await db.atualizarProduto(5, payload);

    expect(mockInvoke).toHaveBeenCalledWith("atualizar_produto", { id: 5, input: payload });
  });
});
