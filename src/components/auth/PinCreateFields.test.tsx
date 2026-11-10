import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { PinCreateFields, regrasCumpridas } from "@/components/auth/PinCreateFields";
import { PinLock } from "@/components/auth/PinLock";

function Harness() {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <>
      <PinLock checked={regrasCumpridas(pin, confirm)} spin={pin.length + confirm.length} />
      <PinCreateFields idPrefix="t" pin={pin} confirmPin={confirm} onPinChange={setPin} onConfirmPinChange={setConfirm} />
    </>
  );
}

describe("PinCreateFields", () => {
  it("mostra as regras ao digitar e vira 'PIN pronto' com todas cumpridas", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.type(screen.getByLabelText("Crie seu PIN"), "1234");
    expect(screen.getByText("Não é sequência (1234, 4321)").closest("li")).toHaveTextContent("(pendente)");

    await user.clear(screen.getByLabelText("Crie seu PIN"));
    await user.type(screen.getByLabelText("Crie seu PIN"), "2580");
    await user.type(screen.getByLabelText("Repita o PIN"), "2580");
    expect(screen.getByRole("status")).toHaveTextContent("PIN pronto");
    expect(screen.queryByRole("list", { name: "Regras do PIN" })).not.toBeInTheDocument();

    // O cadeado é decorativo e nunca mostra o PIN digitado.
    const lock = container.querySelector(".pin-lock")!;
    expect(lock).toHaveAttribute("aria-hidden", "true");
    const middleRow = Array.from(lock.querySelectorAll(".pin-lock__strip"))
      .map((strip) => strip.children[strip.children.length - 2]?.textContent ?? "")
      .join("");
    expect(middleRow).not.toContain("2580");
  });

  it("não aceita letras no campo", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText("Crie seu PIN"), "12a3b");
    expect(screen.getByLabelText("Crie seu PIN")).toHaveValue("123");
  });
});
