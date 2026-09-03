import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClienteSelectorBusca } from "./ClienteSelectorBusca";
import type { Cliente } from "@/types";

const clientes = [
  { id: 1, nome: "Ana Silva", tipo_pessoa: "PF", documento: "12345678909", telefone: "71999999999" },
  { id: 2, nome: "Bruno Souza", tipo_pessoa: "PF", documento: "98765432100", telefone: "71888888888" },
] as Cliente[];

function renderBusca(onSelecionarCliente = vi.fn()) {
  return render(
    <ClienteSelectorBusca
      dropdownRef={{ current: null }}
      termoBusca="an"
      setTermoBusca={vi.fn()}
      buscando={false}
      dropdownAberto
      setDropdownAberto={vi.fn()}
      resultados={clientes}
      onSelecionarCliente={onSelecionarCliente}
      onAbrirNovoCliente={vi.fn()}
    />,
  );
}

describe("ClienteSelectorBusca", () => {
  it("navega pelos resultados e seleciona o cliente ativo com o teclado", () => {
    const onSelecionarCliente = vi.fn();
    renderBusca(onSelecionarCliente);
    const input = screen.getByRole("combobox");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Ana Silva/i })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Bruno Souza/i })).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelecionarCliente).toHaveBeenCalledWith(clientes[1]);
  });

  it("fecha as sugestões ao pressionar Esc", () => {
    const setDropdownAberto = vi.fn();
    render(
      <ClienteSelectorBusca
        dropdownRef={{ current: null }}
        termoBusca="an"
        setTermoBusca={vi.fn()}
        buscando={false}
        dropdownAberto
        setDropdownAberto={setDropdownAberto}
        resultados={clientes}
        onSelecionarCliente={vi.fn()}
        onAbrirNovoCliente={vi.fn()}
      />,
    );

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(setDropdownAberto).toHaveBeenCalledWith(false);
  });
});
