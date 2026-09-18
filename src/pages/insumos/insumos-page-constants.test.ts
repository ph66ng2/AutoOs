import { describe, expect, it } from "vitest";
import {
  CATEGORIA_OPTIONS,
  categoriaProdutoLabel,
} from "@/pages/insumos/insumos-page-constants";

describe("categoriaProdutoLabel", () => {
  it("usa o mesmo texto do filtro de Insumos", () => {
    expect(categoriaProdutoLabel("CARTUCHO")).toBe("Cartucho");
    expect(categoriaProdutoLabel("ROLO")).toBe("Rolo");
    expect(CATEGORIA_OPTIONS.some((option) => option.value === "RIBBON")).toBe(false);
    expect(CATEGORIA_OPTIONS.some((option) => option.value === "ETIQUETA")).toBe(false);
  });
});
