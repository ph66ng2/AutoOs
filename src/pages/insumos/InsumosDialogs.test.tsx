import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { InsumosProdutoDialog } from "./InsumosDialogs";
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
