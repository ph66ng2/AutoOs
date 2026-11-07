import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { InsumosDeleteDialog, InsumosProdutoDialog } from "./InsumosDialogs";
import type { ProdutoFormData } from "@/lib/validations";
import type { Produto } from "@/types";

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

function TestDialog({ editando = null }: { editando?: Produto | null }) {
  const form = useForm<ProdutoFormData>({
    defaultValues: {
      nome: "Insumo",
      codigo: "TESTE",
      categoria: editando?.categoria ?? "",
      quantidade_estoque: 0,
      quantidade_minima: editando?.quantidade_minima ?? 0,
      preco_custo: 0,
      preco_venda: 0,
    },
  });

  return (
    <InsumosProdutoDialog
      open
      onOpenChange={vi.fn()}
      editando={editando}
      form={form}
      salvando={false}
      onSubmit={vi.fn()}
    />
  );
}

describe("aviso de uso na exclusão de peça", () => {
  const produto = { id: 1, nome: "Toner XYZ" } as Produto;

  it("não mostra aviso quando a peça não está em orçamentos", () => {
    render(
      <InsumosDeleteDialog
        open
        onOpenChange={vi.fn()}
        deletando={produto}
        salvando={false}
        onDelete={vi.fn()}
        uso={{ os_em_aberto: [], os_baixa_pendente: [], orcamentos_insumos: [] }}
      />,
    );
    expect(
      screen.queryByText("Esta peça está em orçamentos em andamento"),
    ).not.toBeInTheDocument();
  });

  it("lista os orçamentos em andamento e mantém o botão habilitado", () => {
    render(
      <InsumosDeleteDialog
        open
        onOpenChange={vi.fn()}
        deletando={produto}
        salvando={false}
        onDelete={vi.fn()}
        uso={{
          os_em_aberto: ["OS-10"],
          os_baixa_pendente: [],
          orcamentos_insumos: ["OI-3"],
        }}
      />,
    );
    expect(
      screen.getByText("Esta peça está em orçamentos em andamento"),
    ).toBeInTheDocument();
    expect(screen.getByText("OS com orçamento ainda não decidido")).toBeInTheDocument();
    expect(screen.getByText("OS-10")).toBeInTheDocument();
    expect(screen.getByText("Orçamentos de insumos em aberto")).toBeInTheDocument();
    expect(screen.getByText("OI-3")).toBeInTheDocument();
    expect(screen.queryByText("OS aprovadas com baixa pendente")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir" })).toBeEnabled();
  });

  it("desabilita o botão Excluir enquanto o uso está carregando", () => {
    render(
      <InsumosDeleteDialog
        open
        onOpenChange={vi.fn()}
        deletando={produto}
        salvando={false}
        onDelete={vi.fn()}
        uso={null}
        carregandoUso
      />,
    );
    expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
  });
});

describe("mínimo no cadastro de insumos", () => {
  it("acompanha cada categoria escolhida e permite ajuste manual", async () => {
    const user = userEvent.setup();
    render(<TestDialog />);
    const minimo = screen.getAllByRole("spinbutton")[1] as HTMLInputElement;

    for (const [categoria, esperado] of [
      ["Impressora", "0"],
      ["Etiqueta", "1"],
      ["Ribbon", "2"],
      ["Peça", "1"],
      ["Outros", "0"],
    ]) {
      await user.click(screen.getByRole("combobox"));
      await user.click(await screen.findByRole("option", { name: categoria }));
      expect(minimo).toHaveValue(Number(esperado));
    }

    await user.clear(minimo);
    await user.type(minimo, "7");
    expect(minimo).toHaveValue(7);
  });

  it("preserva o mínimo existente ao mudar a categoria na edição", async () => {
    const user = userEvent.setup();
    render(<TestDialog editando={{ categoria: "ETIQUETA", quantidade_minima: 7 } as Produto} />);
    const minimo = screen.getAllByRole("spinbutton")[1] as HTMLInputElement;

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Ribbon" }));
    expect(minimo).toHaveValue(7);
  });
});
