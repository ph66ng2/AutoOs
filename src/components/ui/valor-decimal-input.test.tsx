import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ValorDecimalInput } from "./valor-decimal-input";

function Harness({
  inicial = 7.5,
  required,
}: {
  inicial?: number;
  required?: boolean;
}) {
  const [valor, setValor] = useState(inicial);
  return (
    <>
      <ValorDecimalInput aria-label="Valor" required={required} value={valor} onValueChange={setValor} />
      <span data-testid="valor-atual">{valor}</span>
    </>
  );
}

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

  it("mantém o ponto de milhar enquanto digita 1.234,50", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<ValorDecimalInput aria-label="Valor" value={0} onValueChange={onValueChange} />);
    const campo = screen.getByLabelText("Valor");
    await user.clear(campo);
    await user.type(campo, "1.234,50");
    expect(campo).toHaveValue("1.234,50");
    expect(onValueChange).toHaveBeenLastCalledWith(1234.5);
    await user.tab();
    expect(campo).toHaveValue("1.234,50");
  });

  it("aceita colar R$ 1.234,50 com espaço não separável", async () => {
    const user = userEvent.setup();
    render(<Harness inicial={10} />);
    const campo = screen.getByLabelText("Valor");
    await user.clear(campo);
    await user.paste("R$\u00a01.234,50");
    expect(campo).toHaveValue("R$\u00a01.234,50");
    expect(screen.getByTestId("valor-atual")).toHaveTextContent("1234.5");
    await user.tab();
    expect(campo).toHaveValue("1.234,50");
    expect(screen.queryByText("Informe um valor válido.")).not.toBeInTheDocument();
  });

  it("mostra erro e não restaura o valor antigo quando o texto é inválido", async () => {
    const user = userEvent.setup();
    render(<Harness inicial={10} />);
    const campo = screen.getByLabelText("Valor");
    await user.clear(campo);
    await user.paste("abc");
    expect(screen.getByText("Informe um valor válido.")).toBeInTheDocument();
    expect(screen.getByTestId("valor-atual")).toHaveTextContent("0");
    await user.tab();
    expect(campo).toHaveValue("abc");
    expect(screen.getByTestId("valor-atual")).toHaveTextContent("0");
  });

  it("campo opcional vazio vira 0 e não restaura o valor anterior", async () => {
    const user = userEvent.setup();
    render(<Harness inicial={7.5} />);
    const campo = screen.getByLabelText("Valor");
    await user.clear(campo);
    expect(screen.getByTestId("valor-atual")).toHaveTextContent("0");
    await user.tab();
    expect(campo).toHaveValue("0,00");
    expect(screen.queryByText("Informe um valor.")).not.toBeInTheDocument();
  });

  it("campo obrigatório vazio mostra erro e não restaura o valor anterior", async () => {
    const user = userEvent.setup();
    render(<Harness inicial={7.5} required />);
    const campo = screen.getByLabelText("Valor");
    await user.clear(campo);
    expect(screen.getByText("Informe um valor.")).toBeInTheDocument();
    expect(screen.getByTestId("valor-atual")).toHaveTextContent("0");
    await user.tab();
    expect(campo).toHaveValue("");
    expect(screen.getByText("Informe um valor.")).toBeInTheDocument();
  });
});
