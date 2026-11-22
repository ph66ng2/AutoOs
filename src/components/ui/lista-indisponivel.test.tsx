import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ListaIndisponivel } from "./lista-indisponivel";

describe("ListaIndisponivel", () => {
  it("diz que a lista não carregou, que nada foi apagado e tenta de novo", async () => {
    const tentar = vi.fn();
    render(<ListaIndisponivel oque="equipamentos" onTentarDeNovo={tentar} />);
    expect(screen.getByRole("status")).toHaveTextContent("Não foi possível carregar os equipamentos");
    expect(screen.getByRole("status")).toHaveTextContent("Nada foi apagado");
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(tentar).toHaveBeenCalledTimes(1);
  });

  it("enquanto tenta, o botão fica desligado", () => {
    render(<ListaIndisponivel oque="clientes" onTentarDeNovo={vi.fn()} tentando />);
    expect(screen.getByRole("button", { name: "Tentando…" })).toBeDisabled();
  });
});
