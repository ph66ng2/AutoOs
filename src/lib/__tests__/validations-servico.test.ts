import { describe, expect, it } from "vitest";
import { servicoCatalogoSchema } from "@/lib/validations";

describe("servicoCatalogoSchema", () => {
  it("aceita preço 0 para serviços em garantia", () => {
    const parsed = servicoCatalogoSchema.parse({
      nome: "Garantia",
      descricao: "Atendimento em garantia",
      preco_padrao: 0,
    });
    expect(parsed.preco_padrao).toBe(0);
  });

  it("aceita preço positivo", () => {
    const parsed = servicoCatalogoSchema.parse({
      nome: "Limpeza",
      descricao: "",
      preco_padrao: "150.50",
    });
    expect(parsed.preco_padrao).toBe(150.5);
  });

  it("rejeita preço negativo", () => {
    const result = servicoCatalogoSchema.safeParse({
      nome: "Garantia",
      descricao: "",
      preco_padrao: -1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/não pode ser negativo/i);
    }
  });
});
