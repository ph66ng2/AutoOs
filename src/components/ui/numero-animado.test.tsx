import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NumeroRolante, SeloQueSalta } from "./numero-animado";

describe("SeloQueSalta", () => {
  it("salta só quando o número sobe", () => {
    const selo = (valor: number) => <SeloQueSalta valor={valor}>{valor}</SeloQueSalta>;
    const { container, rerender } = render(selo(2));
    const pulso = () => container.firstElementChild!.getAttribute("data-pulso");
    expect(pulso()).toBe("0");
    rerender(selo(3));
    expect(pulso()).toBe("1");
    rerender(selo(1));
    expect(pulso()).toBe("1");
  });
});

describe("NumeroRolante", () => {
  it("mostra o valor atual", () => {
    const { container, rerender } = render(<NumeroRolante valor={4} />);
    expect(container).toHaveTextContent("4");
    rerender(<NumeroRolante valor={5} />);
    expect(container).toHaveTextContent("5");
  });
});
