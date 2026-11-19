import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BotaoCopiar } from "./botao-copiar";

describe("BotaoCopiar", () => {
  it("copia o valor e confirma com Copiado", async () => {
    const user = userEvent.setup();
    const escrever = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    render(<BotaoCopiar valor="ZB-123" rotulo="número de série" />);
    await user.click(screen.getByRole("button", { name: "Copiar número de série" }));
    expect(escrever).toHaveBeenCalledWith("ZB-123");
    await waitFor(() => expect(screen.getByRole("button", { name: "Copiado" })).toBeInTheDocument());
  });

  it("sem área de transferência, avisa no próprio botão", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("negado"));
    render(<BotaoCopiar valor="x" rotulo="telefone" />);
    await user.click(screen.getByRole("button", { name: "Copiar telefone" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Não deu para copiar" })).toBeInTheDocument());
  });
});
