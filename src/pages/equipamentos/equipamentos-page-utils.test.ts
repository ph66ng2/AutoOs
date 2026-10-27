import { describe, expect, it } from "vitest";
import { totalOrcamentoAprovacaoValido } from "./equipamentos-page-utils";

describe("totalOrcamentoAprovacaoValido", () => {
  it("recusa 0, vazio e inválido; aceita valor positivo", () => {
    expect(totalOrcamentoAprovacaoValido(0)).toBe(false);
    expect(totalOrcamentoAprovacaoValido(Number.NaN)).toBe(false);
    expect(totalOrcamentoAprovacaoValido(-1)).toBe(false);
    expect(totalOrcamentoAprovacaoValido(0.01)).toBe(true);
    expect(totalOrcamentoAprovacaoValido(150)).toBe(true);
  });
});
