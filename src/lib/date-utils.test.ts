import { describe, expect, it } from "vitest";
import { dateOnlyToLocalDate, formatDatePtBr, formatDateTimeSalvador, parseDbTimestampUtc, todayLocalIsoDate } from "./date-utils";

describe("date-utils", () => {
  it("formata data sem horário sem retroceder pelo fuso UTC", () => {
    expect(formatDatePtBr("2026-09-10")).toBe("10/09/2026");
  });

  it("exibe prazo AAAA-MM-DD sem recuar um dia no fuso do computador", () => {
    expect(formatDatePtBr("2026-11-03")).toBe("03/11/2026");
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

  it("lê TIMESTAMP do banco (sem fuso) como UTC, não como horário do computador", () => {
    // 21:35 UTC é 18:35 em Salvador; antes aparecia 21:35.
    const parsed = parseDbTimestampUtc("2026-10-18 21:35:12.345");
    expect(parsed?.toISOString()).toBe("2026-10-18T21:35:12.345Z");
    expect(formatDateTimeSalvador(parsed)).toBe("18/10/2026, 18:35:12");
  });

  it("não mexe em textos que já trazem fuso e rejeita lixo", () => {
    expect(parseDbTimestampUtc("2026-10-18T21:35:12Z")?.toISOString()).toBe("2026-10-18T21:35:12.000Z");
    expect(parseDbTimestampUtc("2026-10-18T18:35:12-03:00")?.toISOString()).toBe("2026-10-18T21:35:12.000Z");
    expect(parseDbTimestampUtc("não é data")).toBeNull();
    expect(parseDbTimestampUtc(null)).toBeNull();
  });

  it("exibe data e hora no fuso de Salvador independentemente do computador", () => {
    expect(formatDateTimeSalvador("2026-09-14T12:34:56.000Z")).toBe("14/09/2026, 09:34:56");
  });
});
