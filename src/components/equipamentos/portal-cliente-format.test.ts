import { describe, expect, it } from "vitest";
import { formatarValidoAte } from "./portal-cliente-format";

describe("formatarValidoAte", () => {
  it("mostra o último dia do prazo, sem horário, alinhado a Brasília", () => {
    expect(formatarValidoAte("2026-11-04T03:00:00.000Z")).toBe("03/11/2026");
  });
});
