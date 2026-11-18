import { describe, expect, it } from "vitest";
import { movimentoDaBancada, saudacao, variacaoPercentual } from "./inicio";
import type { Equipamento } from "@/types";

const eq = (extra: Partial<Equipamento>) => ({ id: 1, status: "RECEBIDO", data_entrada: "2026-01-05", ...extra }) as Equipamento;

describe("movimentoDaBancada", () => {
  it("conta entradas, entregas (só ENTREGUE) e reprovações por mês do ano pedido", () => {
    const meses = movimentoDaBancada([
      eq({ data_entrada: "2026-03-02" }),
      eq({ data_entrada: "2026-03-10", status: "ENTREGUE", data_saida: "2026-04-01 10:00:00" }),
      eq({ data_entrada: "2026-03-11", status: "PRONTO", data_saida: "2026-04-02" }),
      eq({ data_entrada: "2025-12-30", data_reprovacao: "2026-01-03T12:00:00Z", status: "REPROVADO" }),
    ], 2026);
    expect(meses).toHaveLength(12);
    expect(meses[2]).toMatchObject({ rotulo: "Mar", entraram: 3, entregues: 0, reprovados: 0 });
    expect(meses[3]).toMatchObject({ entregues: 1 });
    expect(meses[0]).toMatchObject({ entraram: 0, reprovados: 1 });
  });
});

describe("variacaoPercentual e saudacao", () => {
  it("compara com o mês anterior e cumprimenta pela hora", () => {
    expect(variacaoPercentual(108, 100)).toBe(8);
    expect(variacaoPercentual(5, 0)).toBeNull();
    expect(saudacao(9)).toBe("Bom dia");
    expect(saudacao(14)).toBe("Boa tarde");
    expect(saudacao(20)).toBe("Boa noite");
  });
});
