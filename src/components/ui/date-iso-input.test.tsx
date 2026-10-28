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
