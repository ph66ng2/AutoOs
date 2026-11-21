import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AvisoSerieRepetida } from "./AvisoSerieRepetida";
import type { Equipamento } from "@/types";

const eq = (id: number, data_entrada: string, status: string, extra: Partial<Equipamento> = {}) =>
  ({ id, data_entrada, status, defeito_relatado: "", marca: "Zebra", modelo: "ZD220", serial_number: "S1", tipo: "", ...extra }) as Equipamento;

function renderizar(registros: Equipamento[], extra: Partial<Parameters<typeof AvisoSerieRepetida>[0]> = {}) {
  const props = {
    registros,
    confirmado: false,
    garantiaDias: 90,
    hojeIso: "2026-11-21",
    onNovaManutencao: vi.fn(),
    onAbrir: vi.fn(),
    ...extra,
  };
  render(<AvisoSerieRepetida {...props} />);
  return props;
}

describe("AvisoSerieRepetida", () => {
  it("pergunta se é nova manutenção, usando a última passagem", async () => {
    const user = userEvent.setup();
    const props = renderizar([
      eq(3, "2026-01-10", "ENTREGUE", { data_saida: "2026-02-01" }),
      eq(9, "2026-03-02", "ENTREGUE", { data_saida: "2026-03-20" }),
    ]);
    expect(screen.getByText("Essa impressora já passou por aqui")).toBeInTheDocument();
    expect(screen.getByText(/2 vezes · última: OS #9, entregue em 20\/03\/2026/)).toBeInTheDocument();
    expect(screen.queryByText(/garantia/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sim, nova manutenção" }));
    expect(props.onNovaManutencao).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });

  it("avisa retorno dentro da garantia", () => {
    renderizar([eq(9, "2026-10-01", "ENTREGUE", { data_saida: "2026-10-29" })]);
    expect(screen.getByText("Entregue há 23 dias: ainda na garantia de 90 dias dos serviços.")).toBeInTheDocument();
  });

  it("ainda em atendimento: oferece abrir a OS e, menor, começar outra mesmo assim", async () => {
    const user = userEvent.setup();
    const props = renderizar([eq(10, "2026-11-10", "EM_MANUTENCAO")]);
    expect(screen.getByText("Essa impressora ainda está em atendimento")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sim, nova manutenção" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir OS #10" }));
    expect(props.onAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
    await user.click(screen.getByRole("button", { name: "Começar outra mesmo assim" }));
    expect(props.onNovaManutencao).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
  });

  it("confirmado: some a pergunta; o histórico abre sob pedido, mais recente primeiro", async () => {
    const user = userEvent.setup();
    const props = renderizar(
      [eq(3, "2026-01-10", "ENTREGUE", { defeito_relatado: "Não liga" }), eq(9, "2026-03-02", "REPROVADO", { defeito_relatado: "Cabeça gasta" })],
      { confirmado: true },
    );
    expect(screen.getByText("Nova manutenção desta impressora.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sim, nova manutenção" })).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver histórico" }));
    const itens = screen.getAllByRole("listitem");
    expect(itens[0]).toHaveTextContent("OS #9");
    expect(itens[0]).toHaveTextContent("Defeito: Cabeça gasta");
    await user.click(screen.getAllByRole("button", { name: "Ver OS" })[0]);
    expect(props.onAbrir).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
  });
});
