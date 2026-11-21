import { fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEscSai } from "../useEscSai";

describe("useEscSai", () => {
  it("Esc sai da página só quando ativo", () => {
    const aoSair = vi.fn();
    const { rerender } = renderHook(({ ativo }) => useEscSai(ativo, aoSair), { initialProps: { ativo: false } });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(aoSair).not.toHaveBeenCalled();
    rerender({ ativo: true });
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(aoSair).toHaveBeenCalledTimes(1);
  });

  it("com janela ou lista aberta, o Esc fecha só ela", () => {
    const aoSair = vi.fn();
    renderHook(() => useEscSai(true, aoSair));
    const janela = render(<div role="dialog" data-state="open" />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    janela.unmount();
    const lista = render(<div role="listbox" />);
    fireEvent.keyDown(document.body, { key: "Escape" });
    lista.unmount();
    expect(aoSair).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(aoSair).toHaveBeenCalledTimes(1);
  });
});
