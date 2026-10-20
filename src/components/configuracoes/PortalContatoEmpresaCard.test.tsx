import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PortalContatoEmpresaCard, urlDoMapa, validarEnderecoMapa } from "@/components/configuracoes/PortalContatoEmpresaCard";

const mocks = vi.hoisted(() => ({ obter: vi.fn(), salvar: vi.fn(), abrirUrl: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { obterContatoPortalEmpresa: mocks.obter, salvarContatoPortalEmpresa: mocks.salvar, abrirUrl: mocks.abrirUrl },
}));

describe("PortalContatoEmpresaCard: endereço e mapa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.obter.mockResolvedValue({ nomeExibicao: "BMI TAG", endereco: "Rua A, 10", mapsUrl: null });
    mocks.salvar.mockImplementation(async (input) => input);
    mocks.abrirUrl.mockResolvedValue(undefined);
  });

  it("valida com as regras do banco", () => {
    expect(validarEnderecoMapa("a".repeat(300), null)).toBeNull();
    expect(validarEnderecoMapa("a".repeat(301), null)).toMatch(/300/);
    expect(validarEnderecoMapa(null, "http://maps.google.com/x")).toMatch(/https/);
    expect(validarEnderecoMapa(null, "https://x.com/a b")).toMatch(/espaços/);
    expect(validarEnderecoMapa(null, `https://x.com/${"a".repeat(487)}`)).toMatch(/500/);
    expect(validarEnderecoMapa(null, "https://maps.app.goo.gl/abc")).toBeNull();
  });

  it("prefere o link informado e cai na busca pelo endereço", () => {
    expect(urlDoMapa("Rua A", "https://maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(urlDoMapa("Rua A, 10", "")).toBe("https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%2010");
    expect(urlDoMapa("", "")).toBeNull();
  });

  it("abre o mapa pela prévia", async () => {
    render(<PortalContatoEmpresaCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Ver no mapa" }));
    await waitFor(() => expect(mocks.abrirUrl).toHaveBeenCalledWith(expect.stringContaining("google.com/maps/search")));
  });

  it("não salva link inválido e mostra a mensagem", async () => {
    render(<PortalContatoEmpresaCard />);
    fireEvent.change(await screen.findByLabelText(/Link do Google Maps/), { target: { value: "http://inseguro.com" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar contato do portal/i }));
    expect(await screen.findByText(/começar com https/)).toBeInTheDocument();
    expect(mocks.salvar).not.toHaveBeenCalled();
  });

  it("salva endereço e link válidos", async () => {
    render(<PortalContatoEmpresaCard />);
    fireEvent.change(await screen.findByLabelText(/Link do Google Maps/), { target: { value: "https://maps.app.goo.gl/abc" } });
    fireEvent.click(screen.getByRole("button", { name: /salvar contato do portal/i }));
    await waitFor(() => expect(mocks.salvar).toHaveBeenCalledWith(
      expect.objectContaining({ endereco: "Rua A, 10", mapsUrl: "https://maps.app.goo.gl/abc" }),
    ));
  });
});
