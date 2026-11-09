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
});

describe("DateIsoInput validade", () => {
  it("reporta inválido com data incompleta ou impossível e válido ao completar", async () => {
    const onValidityChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DateIsoInput aria-label="Data" value="2026-11-03" onValueChange={vi.fn()} onValidityChange={onValidityChange} />,
    );
    const campo = screen.getByLabelText("Data");
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
    await user.clear(campo);
    await user.type(campo, "3102");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    await user.clear(campo);
    await user.type(campo, "31022026");
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    await user.clear(campo);
    await user.type(campo, "04032026");
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it("volta a válido ao desmontar", async () => {
    const onValidityChange = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <DateIsoInput aria-label="Data" value="2026-11-03" onValueChange={vi.fn()} onValidityChange={onValidityChange} />,
    );
    await user.type(screen.getByLabelText("Data"), "9");
    unmount();
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });
});
