import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HistoricoDoSerial } from "./HistoricoDoSerial";
import type { Equipamento } from "@/types";

const eq = (id: number, data_entrada: string, status: string, defeito = "") =>
  ({ id, data_entrada, status, defeito_relatado: defeito, marca: "Zebra", modelo: "ZD220", serial_number: "S1", tipo: "" }) as Equipamento;

describe("HistoricoDoSerial", () => {
  it("resume as passagens (mais recente primeiro), mostra o defeito e abre a OS", async () => {
    const user = userEvent.setup();
    const onAbrir = vi.fn();
    render(
      <HistoricoDoSerial
        registros={[eq(3, "2026-01-10", "ENTREGUE", "Não liga"), eq(9, "2026-03-02", "REPROVADO", "Cabeça gasta")]}
        confirmado={false}
        onConfirmar={vi.fn()}
        onAbrir={onAbrir}
      />,
    );
    expect(screen.getByText("Esta série já passou aqui 2 vezes.")).toBeInTheDocument();
    const itens = screen.getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("OS #9");
    expect(itens[0]).toHaveTextContent("Defeito: Cabeça gasta");
    await user.click(screen.getAllByRole("button", { name: "Ver OS" })[0]);
    expect(onAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it("criar outro ciclo exige marcar a confirmação", async () => {
    const user = userEvent.setup();
    const onConfirmar = vi.fn();
    render(<HistoricoDoSerial registros={[eq(3, "2026-01-10", "ENTREGUE")]} confirmado={false} onConfirmar={onConfirmar} onAbrir={vi.fn()} />);
    expect(screen.getByText("Esta série já passou aqui 1 vez.")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Criar um novo ciclo/ }));
    expect(onConfirmar).toHaveBeenCalledWith(true);
  });
});
