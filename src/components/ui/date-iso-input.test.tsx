import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateIsoInput } from "./date-iso-input";

describe("DateIsoInput", () => {
  it("mostra e grava a data em dd/mm, persistindo ISO", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<DateIsoInput aria-label="Prazo" value="2026-11-03" onValueChange={onValueChange} />);
    const campo = screen.getByLabelText("Prazo");
    expect(campo).toHaveValue("03/11/2026");
    await user.clear(campo);
    await user.type(campo, "04032026");
    expect(onValueChange).toHaveBeenLastCalledWith("2026-03-04");
  });

  it("só dígitos viram dd/mm/aaaa com as barras e o cursor fica depois do último dígito", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<DateIsoInput aria-label="Data" value="" onValueChange={onValueChange} />);
    const campo = screen.getByLabelText("Data") as HTMLInputElement;
    await user.type(campo, "0212");
    expect(campo).toHaveValue("02/12");
    expect(campo.selectionStart).toBe(5);
    await user.type(campo, "2026");
    expect(campo).toHaveValue("02/12/2026");
    expect(onValueChange).toHaveBeenLastCalledWith("2026-12-02");
  });

  it("corrigir um dígito no meio não embaralha o resto da data", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<DateIsoInput aria-label="Data" value="" onValueChange={onValueChange} />);
    const campo = screen.getByLabelText("Data") as HTMLInputElement;
    await user.type(campo, "0212202");
    // cursor logo depois do dia ("02/|12/202"): apaga o 2 e digita 3 → 03/12/202
    await user.type(campo, "{backspace}3", { initialSelectionStart: 2, initialSelectionEnd: 2 });
    expect(campo).toHaveValue("03/12/202");
    expect(campo.selectionStart).toBe(3);
    await user.type(campo, "6", { initialSelectionStart: 9, initialSelectionEnd: 9 });
    expect(campo).toHaveValue("03/12/2026");
    expect(onValueChange).toHaveBeenLastCalledWith("2026-12-03");
  });
});
