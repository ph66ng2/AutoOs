import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PecasDoServico } from "./PecasDoServico";
import type { PecaVinculada } from "@/types";

vi.mock("@/lib/data/servicos-repository", () => ({
  carregarProdutosParaPecas: vi.fn(async () => [
    { id: "p1", empresa_id: "e", nome: "Cabeça", quantidade_estoque: 5, preco_venda: 10, ativo: true },
  ]),
}));

function Harness({ onValidity }: { onValidity: (v: boolean) => void }) {
  const [pecas, setPecas] = useState<PecaVinculada<string>[]>([
    { produto_id: "p1", nome: "Cabeça", quantidade: 1, valor_unitario: 10 },
  ]);
  return <PecasDoServico pecas={pecas} onChange={setPecas} onValidityChange={onValidity} />;
}

describe("PecasDoServico", () => {
  it("limpa a validade ao remover a peça e re-adicionar o mesmo produto", async () => {
    const onValidity = vi.fn();
    render(<Harness onValidity={onValidity} />);
    fireEvent.change(screen.getByLabelText("Valor de Cabeça"), { target: { value: "abc" } });
    await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(false));
    fireEvent.click(screen.getByLabelText("Remover Cabeça"));
    await waitFor(() => expect(onValidity).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(screen.getByLabelText("Adicionar peça")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("Adicionar peça"), { target: { value: "p1" } });
    await screen.findByLabelText("Valor de Cabeça");
    expect(onValidity).toHaveBeenLastCalledWith(true);
  });
});
