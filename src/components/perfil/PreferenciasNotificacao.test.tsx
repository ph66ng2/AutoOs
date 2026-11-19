import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ salvar: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { salvarAvisosDesligados: m.salvar } }));

import { PreferenciasNotificacao } from "./PreferenciasNotificacao";

describe("PreferenciasNotificacao", () => {
  beforeEach(() => {
    m.salvar.mockReset().mockImplementation(async (tipos: string[]) => tipos);
    localStorage.removeItem("autoos:avisos-windows");
  });

  it("desligar um tipo salva na hora e recarrega o perfil; religar tira da lista", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<PreferenciasNotificacao desligados={["portal"]} onSaved={onSaved} />);
    expect(screen.getByRole("checkbox", { name: "Respostas do Portal do Cliente" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Estoque baixo" }));
    await waitFor(() => expect(m.salvar).toHaveBeenLastCalledWith(["portal", "estoque-baixo"]));
    expect(onSaved).toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Respostas do Portal do Cliente" }));
    await waitFor(() => expect(m.salvar).toHaveBeenLastCalledWith(["estoque-baixo"]));
  });

  it("se salvar falha, a marca volta e o erro aparece", async () => {
    const user = userEvent.setup();
    m.salvar.mockRejectedValue(new Error("Sem conexão"));
    render(<PreferenciasNotificacao desligados={[]} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("checkbox", { name: "Nova OS para mim" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sem conexão");
    expect(screen.getByRole("checkbox", { name: "Nova OS para mim" })).toBeChecked();
  });

  it("aviso do Windows é deste computador (localStorage)", async () => {
    const user = userEvent.setup();
    render(<PreferenciasNotificacao desligados={[]} onSaved={vi.fn()} />);
    await user.click(screen.getByRole("checkbox", { name: "Avisar no Windows" }));
    expect(localStorage.getItem("autoos:avisos-windows")).toBe("off");
  });
});
