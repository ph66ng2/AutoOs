import { describe, expect, it } from "vitest";
import { receitaPorMes } from "./useReceitaPorMes";
import type { Equipamento } from "@/types";

const eq = (parcial: Partial<Equipamento>) => parcial as Equipamento;

describe("receitaPorMes", () => {
  it("soma o orçamento aprovado por mês e ignora sem aprovação ou sem valor", () => {
    const meses = receitaPorMes([
      eq({ data_aprovacao: "2026-10-03", valor_orcamento: 100 }),
      eq({ data_aprovacao: "2026-10-20", valor_orcamento: 50 }),
      eq({ data_aprovacao: "2026-11-01", valor_orcamento: null as unknown as number, valor_final: 80 }),
      eq({ data_aprovacao: undefined, valor_orcamento: 999 }),
      eq({ data_aprovacao: "2026-11-02", valor_orcamento: 0 }),
    ]);
    expect(meses.map((m) => [m.chave, m.valor])).toEqual([["2026-10", 150], ["2026-11", 80]]);
  });
});
