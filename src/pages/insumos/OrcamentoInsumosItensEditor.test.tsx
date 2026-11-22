import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { OrcamentoInsumosItensEditor } from "@/pages/insumos/OrcamentoInsumosItensEditor";
import { calcularTotaisOrcamentoInsumos, type LinhaOrcamentoInsumos } from "@/lib/orcamento-insumos";

vi.mock("@/lib/db", () => ({ db: { listarProdutos: vi.fn().mockResolvedValue([]) } }));

const linha: LinhaOrcamentoInsumos = {
  produto_id: 7,
  descricao: "Toner",
  categoria: "TONER",
  quantidade: 1,
  valor_unitario: 10,
  saldo: 5,
};

function Harness({ onValidity }: { onValidity: (valido: boolean) => void }) {
  const [linhas, setLinhas] = useState<LinhaOrcamentoInsumos[]>([linha]);
  return (
    <>
      <button type="button" onClick={() => setLinhas([linha])}>
        readicionar
      </button>
      <OrcamentoInsumosItensEditor
        linhas={linhas}
        totais={calcularTotaisOrcamentoInsumos(linhas, 0)}
        onChange={setLinhas}
        onValidityChange={onValidity}
      />
    </>
  );
}

describe("OrcamentoInsumosItensEditor", () => {
  it("remover linha com preço inválido e re-adicionar o produto não prende a validade", () => {
    const onValidity = vi.fn();
    render(<Harness onValidity={onValidity} />);

    fireEvent.change(screen.getByLabelText("Valor unitário de Toner"), { target: { value: "abc" } });
    fireEvent.blur(screen.getByLabelText("Valor unitário de Toner"));
    expect(onValidity).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Remover Toner" }));
    expect(onValidity).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "readicionar" }));
    expect(screen.getByLabelText("Valor unitário de Toner")).toBeInTheDocument();
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });
});
