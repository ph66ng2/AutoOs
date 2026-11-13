import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { AppearancePicker } from "./AppearancePicker";
import { AVATAR_SHAPES } from "@/lib/profile-appearance";

it("oferece apenas formas, com seleção e rótulos acessíveis", async () => {
  const onIconChange = vi.fn();
  render(<AppearancePicker color="#2563EB" icon="shape-orb" theme="light" onColorChange={vi.fn()} onIconChange={onIconChange} onThemeChange={vi.fn()} />);
  const choices = within(screen.getByRole("group", { name: "Forma" }));
  expect(choices.getAllByRole("button")).toHaveLength(AVATAR_SHAPES.length);
  for (const { label } of AVATAR_SHAPES) expect(choices.getByRole("button", { name: label })).toBeInTheDocument();
  for (const label of ["Fone", "Chave", "Impressora", "Café", "Estrela", "Ou uma forma"]) expect(screen.queryByText(label)).not.toBeInTheDocument();
  expect(choices.getByRole("button", { name: "Círculo" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.setup().click(choices.getByRole("button", { name: "Hexágono" }));
  expect(onIconChange).toHaveBeenCalledWith("shape-hex");
});
