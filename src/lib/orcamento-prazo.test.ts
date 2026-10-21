import { describe, expect, it } from "vitest";
import { dataIsoEmDias, ehErroPrazoVencido, formatarDataIso } from "@/lib/orcamento-prazo";

describe("orcamento-prazo", () => {
  it("reconhece o erro de prazo vencido", () => {
    expect(ehErroPrazoVencido("O prazo de aprovação do orçamento já terminou. Atualize o prazo antes de enviar.")).toBe(true);
    expect(ehErroPrazoVencido("Outro erro qualquer")).toBe(false);
    expect(ehErroPrazoVencido("")).toBe(false);
  });

  it("soma dias e formata a data", () => {
    expect(dataIsoEmDias(7, new Date(2026, 9, 21))).toBe("2026-10-28");
    expect(dataIsoEmDias(7, new Date(2026, 11, 28))).toBe("2027-01-04");
    expect(formatarDataIso("2026-10-28")).toBe("28/10/2026");
  });
});
