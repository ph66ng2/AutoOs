import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FiltroDeStatus } from "../FiltroDeStatus";

const principais = [
  { value: "TODOS", label: "Todos" },
  { value: "RECEBIDO", label: "Recebido" },
  { value: "PRONTO", label: "Pronto" },
];

describe("FiltroDeStatus múltiplo", () => {
  it("clique simples troca; Ctrl+clique soma e tira", () => {
    const onChange = vi.fn();
    const { rerender } = render(<FiltroDeStatus rotulo="f" principais={principais} valor="RECEBIDO" onChange={onChange} multiplo />);
    fireEvent.click(screen.getByRole("button", { name: "Pronto" }));
    expect(onChange).toHaveBeenLastCalledWith("PRONTO");
    fireEvent.click(screen.getByRole("button", { name: "Pronto" }), { ctrlKey: true });
    expect(onChange).toHaveBeenLastCalledWith("RECEBIDO,PRONTO");

    rerender(<FiltroDeStatus rotulo="f" principais={principais} valor="RECEBIDO,PRONTO" onChange={onChange} multiplo />);
    expect(screen.getByRole("button", { name: "Recebido" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pronto" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Recebido" }), { ctrlKey: true });
    expect(onChange).toHaveBeenLastCalledWith("PRONTO");
  });

  it("tirar o último volta para Todos; sem multiplo o Ctrl não combina", () => {
    const onChange = vi.fn();
    const { rerender } = render(<FiltroDeStatus rotulo="f" principais={principais} valor="PRONTO" onChange={onChange} multiplo />);
    fireEvent.click(screen.getByRole("button", { name: "Pronto" }), { ctrlKey: true });
    expect(onChange).toHaveBeenLastCalledWith("TODOS");
    rerender(<FiltroDeStatus rotulo="f" principais={principais} valor="PRONTO" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Recebido" }), { ctrlKey: true });
    expect(onChange).toHaveBeenLastCalledWith("RECEBIDO");
  });
});
