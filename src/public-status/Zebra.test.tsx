import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TITULO_EM_PREPARACAO } from "./StatusView";
import { Manada, pelagemDoTitulo, Zebra } from "./Zebra";

describe("zebra do portal", () => {
  it("muda de pelagem conforme a etapa", () => {
    expect(pelagemDoTitulo("Recebemos seu equipamento")).toBe("padrao");
    expect(pelagemDoTitulo("Estamos analisando seu equipamento")).toBe("azul");
    expect(pelagemDoTitulo(TITULO_EM_PREPARACAO)).toBe("azul");
    expect(pelagemDoTitulo("O orçamento aguarda sua resposta")).toBe("laco");
    expect(pelagemDoTitulo("O prazo do orçamento terminou")).toBe("laco");
    expect(pelagemDoTitulo("Serviço em andamento")).toBe("verde");
    expect(pelagemDoTitulo("Pronto para retirada")).toBe("coroa");
    expect(pelagemDoTitulo("Equipamento entregue")).toBe("coroa");
    expect(pelagemDoTitulo("Orçamento não aprovado")).toBe("padrao");
    expect(pelagemDoTitulo("Título desconhecido")).toBe("padrao");
    expect(pelagemDoTitulo("Recebemos seu equipamento", true)).toBe("coroa");
  });

  it("é só enfeite: fica fora do leitor de tela", () => {
    const { container } = render(<><Zebra pelagem="verde" /><Manada /></>);
    const imagens = container.querySelectorAll("img");
    expect(imagens).toHaveLength(6);
    imagens.forEach((img) => expect(img).toHaveAttribute("alt", ""));
    expect(container.querySelector(".portal-manada")).toHaveAttribute("aria-hidden", "true");
  });
});
