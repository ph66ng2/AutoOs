import { describe, expect, it } from "vitest";
import {
  CATEGORIA_OPTIONS,
  categoriaProdutoLabel,
} from "@/pages/insumos/insumos-page-constants";

describe("categoriaProdutoLabel", () => {
  it("usa o mesmo texto do filtro de Insumos", () => {
    expect(categoriaProdutoLabel("RIBBON")).toBe("Ribbon");
    expect(categoriaProdutoLabel("PEÇA")).toBe("Peça");
    expect(CATEGORIA_OPTIONS.some((option) => option.value === "ETIQUETA")).toBe(true);
    expect(CATEGORIA_OPTIONS.some((option) => option.value === "IMPRESSORA")).toBe(true);
  });
});
