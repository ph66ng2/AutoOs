import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GastosTable } from "./GastosTable";
import type { GastoVariavel } from "@/types";

const gasto: GastoVariavel = {
  id: 1,
  descricao: "Toner",
  valor: 80,
  data: "2026-10-27",
  categoria: "Outros",
};

describe("GastosTable", () => {
  it("mostra data YYYY-MM-DD no calendário local, sem recuar pelo UTC", () => {
    render(
      <GastosTable
        gastosFixos={[]}
        gastosVariaveis={[gasto]}
        loading={false}
        onEditFixo={vi.fn()}
        onEditVariavel={vi.fn()}
      />,
    );
    expect(screen.getByText("27/10/2026")).toBeInTheDocument();
    expect(screen.queryByText("26/10/2026")).not.toBeInTheDocument();
  });
});
