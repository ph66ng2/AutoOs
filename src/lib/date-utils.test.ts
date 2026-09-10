import { describe, expect, it } from "vitest";
import { dateOnlyToLocalDate, formatDatePtBr, todayLocalIsoDate } from "./date-utils";

describe("date-utils", () => {
  it("formata data sem horário sem retroceder pelo fuso UTC", () => {
    expect(formatDatePtBr("2026-09-10")).toBe("10/09/2026");
  });

  it("gera a data ISO usando o calendário local", () => {
    expect(todayLocalIsoDate(new Date(2026, 8, 10, 23, 30))).toBe("2026-09-10");
  });

  it("converte data pura para o mesmo dia local", () => {
    const parsed = dateOnlyToLocalDate("2026-09-10");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(10);
  });
});
