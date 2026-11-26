import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const recarregarResumo = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useResumoEstoque", () => ({
  useResumoEstoque: () => ({
    resumo: { orcamentosAbertos: 5, orcamentosPorStatus: [{ status: "ENVIADO", total: 3 }] },
    recarregar: recarregarResumo,
  }),
}));
type PropsLista = { contagemPorStatus?: unknown; onEstoqueAlterado?: () => void; renderCabecalho?: (botao: React.ReactNode) => React.ReactNode };
const props = vi.hoisted(() => ({ atual: null as null | PropsLista }));
vi.mock("@/pages/insumos/OrcamentosInsumosTab", () => ({
  OrcamentosInsumosTab: (p: PropsLista) => {
    props.atual = p;
    return (
      <>
        {p.renderCabecalho?.(<button>novo-orcamento</button>)}
        <button onClick={p.onEstoqueAlterado}>aprovar-oi</button>
      </>
    );
  },
}));

import VendasInsumos from "@/pages/VendasInsumos";

describe("Vendas de insumos", () => {
  it("mostra os orçamentos abertos, passa a contagem aos filtros e recarrega os números depois de uma ação", async () => {
    render(<VendasInsumos />);
    expect(screen.getByRole("heading", { name: "Vendas de insumos" })).toBeInTheDocument();
    expect(screen.getByText("5 orçamentos abertos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "novo-orcamento" })).toBeInTheDocument();
    expect(props.atual?.contagemPorStatus).toEqual([{ status: "ENVIADO", total: 3 }]);
    await userEvent.setup().click(screen.getByText("aprovar-oi"));
    expect(recarregarResumo).toHaveBeenCalledTimes(1);
  });
});
