import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ValorDecimalInput } from "./valor-decimal-input";

describe("ValorDecimalInput", () => {
  it("interpreta vírgula como decimal pt-BR", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<ValorDecimalInput aria-label="Valor" value={0} onValueChange={onValueChange} />);
    const campo = screen.getByLabelText("Valor");
    await user.clear(campo);
    await user.type(campo, "1234,50");
    expect(onValueChange).toHaveBeenLastCalledWith(1234.5);
  });
});
