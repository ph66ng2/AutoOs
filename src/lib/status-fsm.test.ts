import { describe, expect, it } from "vitest";
import { canCorrectStatus, canTransition, getCorrectionStates } from "./status-fsm";

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
});
