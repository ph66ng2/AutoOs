import { describe, expect, it } from "vitest";
import { totalOrcamentoAjusteValido, totalOrcamentoAprovacaoValido } from "./equipamentos-page-utils";

describe("totalOrcamentoAprovacaoValido", () => {
  it("recusa 0, vazio e inválido; aceita valor positivo", () => {
    expect(totalOrcamentoAprovacaoValido(0)).toBe(false);
    expect(totalOrcamentoAprovacaoValido(Number.NaN)).toBe(false);
    expect(totalOrcamentoAprovacaoValido(-1)).toBe(false);
    expect(totalOrcamentoAprovacaoValido(0.01)).toBe(true);
    expect(totalOrcamentoAprovacaoValido(150)).toBe(true);
  });
});

describe("totalOrcamentoAjusteValido", () => {
  it("aceita 0 só em OS só de garantia", () => {
    expect(totalOrcamentoAjusteValido(0, false)).toBe(false);
    expect(totalOrcamentoAjusteValido(0, true)).toBe(true);
    expect(totalOrcamentoAjusteValido(10, false)).toBe(true);
    expect(totalOrcamentoAjusteValido(Number.NaN, true)).toBe(false);
  });
});
