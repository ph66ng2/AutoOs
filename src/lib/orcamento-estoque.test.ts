import { describe, expect, it } from "vitest";
import { orcamentoEmElaboracao, osSomenteGarantia, transicaoElaboraOrcamento } from "./orcamento-estoque";

describe("orcamentoEmElaboracao", () => {
  it("é verdadeiro enquanto o orçamento não foi decidido", () => {
    for (const status of ["RECEBIDO", "EM_VERIFICACAO", "VERIFICADO", "AGUARDANDO_APROVACAO"]) {
      expect(orcamentoEmElaboracao(status)).toBe(true);
    }
  });

  it("é falso depois da decisão ou em outros status", () => {
    for (const status of ["APROVADO", "REPROVADO", "PRONTO", "ENTREGUE", ""]) {
      expect(orcamentoEmElaboracao(status)).toBe(false);
    }
  });
});

describe("transicaoElaboraOrcamento", () => {
  it("cobre só o envio do orçamento para aprovação, sem valor final nem correção", () => {
    expect(transicaoElaboraOrcamento("VERIFICADO", "AGUARDANDO_APROVACAO", false)).toBe(true);
    expect(transicaoElaboraOrcamento("AGUARDANDO_APROVACAO", "AGUARDANDO_APROVACAO", false, 0)).toBe(true);
  });

  it("não cobre decisão, entrega, valor final, correção nem origem fora da elaboração", () => {
    expect(transicaoElaboraOrcamento("VERIFICADO", "APROVADO", false)).toBe(false);
    expect(transicaoElaboraOrcamento("AGUARDANDO_APROVACAO", "REPROVADO", false)).toBe(false);
    expect(transicaoElaboraOrcamento("PRONTO", "ENTREGUE", false)).toBe(false);
    expect(transicaoElaboraOrcamento("VERIFICADO", "AGUARDANDO_APROVACAO", false, 100)).toBe(false);
    expect(transicaoElaboraOrcamento("VERIFICADO", "AGUARDANDO_APROVACAO", true)).toBe(false);
    expect(transicaoElaboraOrcamento("EM_VERIFICACAO", "AGUARDANDO_APROVACAO", false)).toBe(false);
  });
});

describe("osSomenteGarantia", () => {
  it("exige ao menos um item e todos com valor 0", () => {
    expect(osSomenteGarantia([])).toBe(false);
    expect(osSomenteGarantia([{ valor: 0 }, { valor: 0, pecas: [{ valor_unitario: 0 }] }])).toBe(true);
    expect(osSomenteGarantia([{ valor: 0 }, { valor: 80 }])).toBe(false);
    expect(osSomenteGarantia([{ valor: 0, pecas: [{ valor_unitario: 10 }] }])).toBe(false);
  });
});
