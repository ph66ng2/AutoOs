import { describe, expect, it } from "vitest";
import { prazoOuData, proximaAcaoVenda } from "./orcamento-insumos";

describe("proximaAcaoVenda", () => {
  it.each([
    ["RASCUNHO", false, "Enviar", "enviar"],
    ["ENVIADO", false, "Aprovar", "aprovar"],
    ["RASCUNHO", true, "Renovar validade", "renovar"],
    ["ENVIADO", true, "Renovar validade", "renovar"],
    ["APROVADO", false, "Marcar entregue", "entregar"],
    ["ENTREGUE", false, "Ver", "ver"],
    ["REPROVADO", false, "Ver", "ver"],
    ["CANCELADO", false, "Ver", "ver"],
  ] as const)("%s (vencido: %s) → %s", (status, vencido, rotulo, tipo) => {
    expect(proximaAcaoVenda(status, vencido)).toEqual({ rotulo, tipo });
  });
});

describe("prazoOuData", () => {
  const base = { validade: "2026-11-20", decidido_em: null, entregue_em: null, criado_em: "2026-11-03 13:00:00+00", forma_pagamento_codigo: null };
  const hoje = "2026-11-17";

  it("validade só em Rascunho e Enviado, com vence ou venceu", () => {
    expect(prazoOuData({ ...base, status: "ENVIADO" }, hoje)).toBe("vence 20/11");
    expect(prazoOuData({ ...base, status: "RASCUNHO", validade: "2026-11-08" }, hoje)).toBe("venceu 08/11");
    expect(prazoOuData({ ...base, status: "RASCUNHO", validade: null }, hoje)).toBe("sem validade");
  });

  it("nas outras situações mostra a data do que aconteceu, no fuso de Salvador", () => {
    expect(prazoOuData({ ...base, status: "APROVADO", decidido_em: "2026-11-12 14:00:00+00", forma_pagamento_codigo: "PIX" }, hoje)).toBe("aprovado 12/11 · Pix");
    // 01:30 UTC do dia 11 ainda é dia 10 em Salvador.
    expect(prazoOuData({ ...base, status: "ENTREGUE", entregue_em: "2026-11-11 01:30:00+00" }, hoje)).toBe("entregue 10/11");
    expect(prazoOuData({ ...base, status: "REPROVADO", decidido_em: "2026-11-07 12:00:00+00" }, hoje)).toBe("reprovado 07/11");
    expect(prazoOuData({ ...base, status: "CANCELADO" }, hoje)).toBe("criado 03/11");
    expect(prazoOuData({ ...base, status: "APROVADO" }, hoje)).toBe("aprovado");
  });
});
