import { fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAtalhosGlobais } from "../useAtalhosGlobais";

function acoes() {
  return { abrirBusca: vi.fn(), abrirAjuda: vi.fn(), novaEntrada: vi.fn() };
}

describe("useAtalhosGlobais", () => {
  it("Ctrl+K abre a busca até dentro de um campo; letras só fora de campos", () => {
    const a = acoes();
    renderHook(() => useAtalhosGlobais(a));
    const { getByRole } = render(<main><input aria-label="Pesquisar equipamentos" /></main>);
    const campo = getByRole("textbox");
    fireEvent.keyDown(campo, { key: "k", ctrlKey: true });
    expect(a.abrirBusca).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(campo, { key: "n" });
    expect(a.novaEntrada).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "n" });
    expect(a.novaEntrada).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "?" });
    expect(a.abrirAjuda).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(campo);
  });

  it("com uma janela modal aberta nem as letras nem o Ctrl+K fazem nada", () => {
    const a = acoes();
    renderHook(() => useAtalhosGlobais(a));
    render(<div role="dialog" data-state="open">janela</div>);
    fireEvent.keyDown(document.body, { key: "n" });
    expect(a.novaEntrada).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(a.abrirBusca).not.toHaveBeenCalled();
  });
});
