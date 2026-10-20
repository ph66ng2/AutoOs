import { beforeEach, describe, expect, it, vi } from "vitest";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => mockInvoke(...args) }));

import { db } from "@/lib/db";

describe("db: clientes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
  });

  it("não força receber_email/receber_whatsapp quando o cliente não os informa", async () => {
    await db.atualizarCliente(3, { telefone: "71999990000", atualizado_em: "t" });
    const input = (mockInvoke.mock.calls[0]![1] as { input: Record<string, unknown> }).input;
    expect(input.receber_email).toBeUndefined();
    expect(input.receber_whatsapp).toBeUndefined();
    expect(input.exige_ordem_compra).toBeUndefined();
  });

  it("repassa os valores salvos e exige_ordem_compra", async () => {
    await db.atualizarCliente(3, { receber_email: false, receber_whatsapp: false, exige_ordem_compra: true });
    expect(mockInvoke).toHaveBeenCalledWith("atualizar_cliente", {
      id: 3,
      input: expect.objectContaining({ receber_email: false, receber_whatsapp: false, exige_ordem_compra: true }),
    });
  });
});
