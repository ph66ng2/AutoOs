import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ salvar: vi.fn(async (dias: number) => dias) }));
vi.mock("@/hooks/useGarantiaServicos", () => ({ useGarantiaServicos: () => ({ dias: 90, salvar: m.salvar }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GarantiaServicosCard } from "./GarantiaServicosCard";

describe("GarantiaServicosCard", () => {
  it("mostra o prazo atual e salva o novo", async () => {
    const user = userEvent.setup();
    render(<GarantiaServicosCard />);
    const campo = screen.getByLabelText("Garantia dos serviços em dias");
    expect(campo).toHaveValue("90");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    await user.clear(campo);
    await user.type(campo, "120");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(m.salvar).toHaveBeenCalledWith(120);
  });
});
