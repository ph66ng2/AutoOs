import { describe, expect, it } from "vitest";
import { textoUltimaMovimentacao } from "./estoque-movimentacao";

describe("textoUltimaMovimentacao", () => {
  it("traduz a origem conhecida, não repete 'OS' e junta referência e dia", () => {
    expect(
      textoUltimaMovimentacao({ ultima_mov_tipo: "SAIDA", ultima_mov_origem: "MANUTENCAO", ultima_mov_referencia: "OS #931", ultima_mov_data: "2026-11-07 10:00:00" }),
    ).toBe("Saída · OS #931 · 07/11");
    expect(textoUltimaMovimentacao({ ultima_mov_tipo: "SAIDA", ultima_mov_origem: "VENDA_INSUMOS", ultima_mov_referencia: "OI-33", ultima_mov_data: "2026-11-10" })).toBe(
      "Saída · venda · OI-33 · 10/11",
    );
  });

  it("origem digitada à mão aparece em minúsculas e campos vazios somem", () => {
    expect(textoUltimaMovimentacao({ ultima_mov_tipo: "ENTRADA", ultima_mov_origem: "Fornecedor", ultima_mov_referencia: " ", ultima_mov_data: "2026-11-03 08:00:00" })).toBe(
      "Entrada · fornecedor · 03/11",
    );
  });

  it("sem movimentação devolve null", () => {
    expect(textoUltimaMovimentacao({ ultima_mov_tipo: null })).toBeNull();
  });
});
