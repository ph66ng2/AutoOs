import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  modelos: [{ id: 1, titulo: "Equipamento pronto", texto: "Olá, {contato}!", ordem: 1, atualizado_em: "2026-11-21 10:00:00+00" }],
  salvar: vi.fn(),
  excluir: vi.fn(),
}));
vi.mock("@/hooks/useModelosMensagem", () => ({
  useModelosMensagem: () => ({ modelos: m.modelos, loading: false, error: null, salvar: m.salvar, excluir: m.excluir, recarregar: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MensagensProntasCard } from "./MensagensProntasCard";

describe("MensagensProntasCard", () => {
  beforeEach(() => {
    m.salvar.mockReset().mockResolvedValue({ id: 2 });
    m.excluir.mockReset().mockResolvedValue(undefined);
  });

  it("cria uma mensagem com campo inserido pelo botão e mostra a prévia", async () => {
    const user = userEvent.setup();
    render(<MensagensProntasCard />);
    await user.click(screen.getByRole("button", { name: /Nova mensagem/ }));
    await user.type(screen.getByLabelText("Nome"), "Lembrete");
    await user.type(screen.getByLabelText("Texto"), "Oi ");
    await user.click(screen.getByRole("button", { name: "Contato" }));
    expect(screen.getByLabelText("Texto")).toHaveValue("Oi {contato}");
    expect(screen.getByText("Oi Lúcia")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(m.salvar).toHaveBeenCalledWith({ id: null, titulo: "Lembrete", texto: "Oi {contato}", atualizado_em: null });
  });

  it("excluir pede confirmação", async () => {
    const user = userEvent.setup();
    render(<MensagensProntasCard />);
    await user.click(screen.getByRole("button", { name: "Excluir Equipamento pronto" }));
    expect(m.excluir).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Excluir mensagem" }));
    expect(m.excluir).toHaveBeenCalledWith(1);
  });
});
