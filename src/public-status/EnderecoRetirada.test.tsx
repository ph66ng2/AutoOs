import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnderecoRetirada, rotasUrl, textoCompartilharEndereco } from "./EnderecoRetirada";

const ENDERECO = "Rua das Flores, 100 - Centro";
const NOME = "Loja Central";

function definirNavegador(props: { share?: unknown; clipboard?: unknown }) {
  Object.defineProperty(navigator, "share", { value: props.share, configurable: true, writable: true });
  Object.defineProperty(navigator, "clipboard", { value: props.clipboard, configurable: true, writable: true });
}

afterEach(() => {
  definirNavegador({ share: undefined, clipboard: undefined });
});

describe("EnderecoRetirada", () => {
  it("'Como chegar' aponta para a rota com o endereço codificado", () => {
    definirNavegador({});
    render(<EnderecoRetirada nome={NOME} endereco={ENDERECO} />);
    const link = screen.getByRole("link", { name: "Como chegar" });
    expect(link).toHaveAttribute("href", rotasUrl(ENDERECO));
    expect(link.getAttribute("href")).toContain(encodeURIComponent(ENDERECO));
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("chama navigator.share com o texto quando a API existe", async () => {
    const share = vi.fn(async () => {});
    definirNavegador({ share });
    render(<EnderecoRetirada nome={NOME} endereco={ENDERECO} mapsUrl="https://maps.app.goo.gl/abc" />);
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar endereço" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({
      title: NOME,
      text: textoCompartilharEndereco(NOME, ENDERECO, "https://maps.app.goo.gl/abc"),
    });
  });

  it("sem navigator.share copia o texto e mostra 'Endereço copiado'", async () => {
    const writeText = vi.fn(async () => {});
    definirNavegador({ clipboard: { writeText } });
    render(<EnderecoRetirada nome={NOME} endereco={ENDERECO} />);
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar endereço" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Endereço copiado");
    expect(writeText).toHaveBeenCalledWith(textoCompartilharEndereco(NOME, ENDERECO, null));
  });

  it("mostra alerta quando a cópia falha", async () => {
    definirNavegador({ clipboard: { writeText: vi.fn(async () => { throw new Error("negado"); }) } });
    render(<EnderecoRetirada nome={NOME} endereco={ENDERECO} />);
    fireEvent.click(screen.getByRole("button", { name: "Compartilhar endereço" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível copiar o endereço.");
  });
});
