import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GastosSummaryCards } from "./GastosSummaryCards";
import type { GastoVariavel } from "@/types";

const gasto: GastoVariavel = {
  id: 1,
  descricao: "Toner",
  valor: 80,
  data: "2026-10-27",
  categoria: "Outros",
};

describe("GastosSummaryCards", () => {
  it("soma os variáveis da lista mesmo se o resumo ainda estiver em zero", () => {
    render(
      <GastosSummaryCards
        resumo={{ total_fixo: 0, total_variavel: 0, total_geral: 0, por_categoria: [] }}
        gastosFixos={[]}
        gastosVariaveis={[gasto]}
        loading={false}
      />,
    );
    expect(screen.getByText("Total Variável").parentElement?.parentElement).toHaveTextContent("R$ 80,00");
  });
});
