import { describe, expect, it } from "vitest";
import { canCorrectStatus, canTransition, getCorrectionStates, getNextStates } from "./status-fsm";
import { getProximosStatus, reabreOrcamentoSemAjuste } from "@/pages/equipamentos/equipamentos-page-utils";

describe("correção controlada de status", () => {
  it("permite retornar de pronto para aguardando aprovação", () => {
    expect(canCorrectStatus("PRONTO", "AGUARDANDO_APROVACAO")).toBe(true);
    expect(getCorrectionStates("PRONTO")).toContain("AGUARDANDO_APROVACAO");
  });

  it("não transforma a correção em transição comum", () => {
    expect(canTransition("PRONTO", "AGUARDANDO_APROVACAO")).toBe(false);
  });

  it("não permite reabrir estados terminais pelo menu de correção", () => {
    expect(getCorrectionStates("ENTREGUE")).toEqual([]);
    expect(getCorrectionStates("ABANDONADO")).toEqual([]);
  });

  it("permite reabrir orçamento recusado por clique indevido", () => {
    expect(canTransition("REPROVADO", "AGUARDANDO_APROVACAO")).toBe(true);
    expect(getNextStates("REPROVADO")).toEqual([
      "AGUARDANDO_APROVACAO",
      "ENTREGUE",
      "ABANDONADO",
    ]);
    expect(getProximosStatus("REPROVADO")).toContain("AGUARDANDO_APROVACAO");
    expect(getCorrectionStates("REPROVADO")).toContain("AGUARDANDO_APROVACAO");
    expect(reabreOrcamentoSemAjuste("REPROVADO", "AGUARDANDO_APROVACAO")).toBe(true);
    expect(reabreOrcamentoSemAjuste("ORCAMENTO_VENCIDO", "AGUARDANDO_APROVACAO")).toBe(false);
  });
});
