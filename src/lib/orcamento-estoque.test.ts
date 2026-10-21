import { describe, expect, it } from "vitest";
import { orcamentoEmElaboracao } from "./orcamento-estoque";

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
