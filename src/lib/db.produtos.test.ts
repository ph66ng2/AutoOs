import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Produto } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { db } from "@/lib/db";
import { registerSensitiveAccessPrompt } from "@/lib/sensitive-action-retry";

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

  it("obterOrcamentoInsumos envia segundoPlano só na leitura de fundo", async () => {
    mockInvoke.mockResolvedValue({ id: 3 });
    await db.obterOrcamentoInsumos(3, true);
    expect(mockInvoke).toHaveBeenLastCalledWith("obter_orcamento_insumos", { id: 3, segundoPlano: true });
    await db.obterOrcamentoInsumos(3);
    expect(mockInvoke).toHaveBeenLastCalledWith("obter_orcamento_insumos", { id: 3 });
  });

  it("leitura de segundo plano com sessão bloqueada não abre o PIN nem repete", async () => {
    const prompt = vi.fn().mockResolvedValue(true);
    const desregistrar = registerSensitiveAccessPrompt(prompt);
    try {
      mockInvoke.mockRejectedValue("Acesso sensível bloqueado. Informe o PIN para continuar.");
      await expect(db.obterOrcamentoInsumos(3, true)).rejects.toContain("bloqueado");
      expect(prompt).not.toHaveBeenCalled();
      expect(mockInvoke).toHaveBeenCalledTimes(1);

      // A leitura visível continua pedindo o PIN e repetindo uma vez.
      mockInvoke.mockRejectedValueOnce("Acesso sensível bloqueado.").mockResolvedValueOnce({ id: 3 });
      await expect(db.obterOrcamentoInsumos(3)).resolves.toEqual({ id: 3 });
      expect(prompt).toHaveBeenCalledTimes(1);
    } finally {
      desregistrar();
    }
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
