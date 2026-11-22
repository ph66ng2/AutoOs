import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChecklistVerificacao } from "./ChecklistVerificacao";

describe("ChecklistVerificacao", () => {
  it("item desmarcado aparece neutro, nunca como reprovado", () => {
    const { container } = render(
      <ChecklistVerificacao itens={[
        { id: "1", nome: "Teste de impressão", verificado: true },
        { id: "2", nome: "Teste de scanner", verificado: false },
      ]} />,
    );
    expect(screen.getByLabelText("Conferido")).toBeInTheDocument();
    expect(screen.getByLabelText("Não marcado")).toBeInTheDocument();
    expect(container.querySelector(".text-destructive")).toBeNull();
  });

  it("sem itens não mostra nada", () => {
    const { container } = render(<ChecklistVerificacao itens={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
