import { fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAtalhosGlobais } from "../useAtalhosGlobais";

function acoes() {
  return { abrirBusca: vi.fn(), abrirAjuda: vi.fn(), novaEntrada: vi.fn(), novaVenda: vi.fn() };
}

describe("useAtalhosGlobais", () => {
  it("atalhos com Ctrl/Alt valem até dentro de um campo; letra sozinha não faz nada", () => {
    const a = acoes();
    renderHook(() => useAtalhosGlobais(a));
    const { getByRole } = render(<main><input aria-label="Pesquisar equipamentos" /></main>);
    const campo = getByRole("textbox");
    fireEvent.keyDown(campo, { key: "k", code: "KeyK", ctrlKey: true });
    expect(a.abrirBusca).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(campo, { key: "n", code: "KeyN" });
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN" });
    expect(a.novaEntrada).not.toHaveBeenCalled();
    fireEvent.keyDown(campo, { key: "˜", code: "KeyN", altKey: true });
    expect(a.novaEntrada).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "v", code: "KeyV", altKey: true });
    expect(a.novaVenda).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "/", code: "Slash", ctrlKey: true });
    expect(a.abrirAjuda).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "?", code: "Slash", shiftKey: true });
    expect(a.abrirAjuda).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "/", code: "Slash" });
    expect(document.activeElement).toBe(campo);
  });

  it("Ctrl+L bloqueia, até com uma janela aberta", () => {
    const a = { ...acoes(), bloquear: vi.fn() };
    renderHook(() => useAtalhosGlobais(a));
    render(<div role="dialog" data-state="open"><input aria-label="Campo" /></div>);
    fireEvent.keyDown(document.body, { key: "l", code: "KeyL", ctrlKey: true });
    expect(a.bloquear).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document.body, { key: "l", code: "KeyL" });
    expect(a.bloquear).toHaveBeenCalledTimes(1);
  });

  it("AltGr (Ctrl+Alt no Windows) não dispara Alt+N", () => {
    const a = acoes();
    renderHook(() => useAtalhosGlobais(a));
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN", altKey: true, ctrlKey: true });
    expect(a.novaEntrada).not.toHaveBeenCalled();
  });

  it("com uma janela modal aberta nenhum atalho faz nada", () => {
    const a = acoes();
    renderHook(() => useAtalhosGlobais(a));
    render(<div role="dialog" data-state="open">janela</div>);
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN", altKey: true });
    fireEvent.keyDown(document.body, { key: "k", code: "KeyK", ctrlKey: true });
    expect(a.novaEntrada).not.toHaveBeenCalled();
    expect(a.abrirBusca).not.toHaveBeenCalled();
  });
});
