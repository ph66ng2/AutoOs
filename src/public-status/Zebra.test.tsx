import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Manada } from "./Zebra";

describe("manada do portal", () => {
  it("é só enfeite: cinco zebras fora do leitor de tela", () => {
    const { container } = render(<Manada />);
    const imagens = container.querySelectorAll("img");
    expect(imagens).toHaveLength(5);
    imagens.forEach((img) => expect(img).toHaveAttribute("alt", ""));
    expect(container.querySelector(".portal-manada")).toHaveAttribute("aria-hidden", "true");
  });
});
