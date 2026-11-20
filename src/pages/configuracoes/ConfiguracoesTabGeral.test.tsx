import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components/ui/tabs";

vi.mock("@/components/UpdateChecker", () => ({ UpdateChecker: () => <p>painel de versão</p> }));

import { ConfiguracoesTabGeral } from "./ConfiguracoesTabGeral";

function renderizar(conectado = true) {
  return render(
    <MemoryRouter>
      <Tabs value="geral">
        <ConfiguracoesTabGeral conectado={conectado} />
      </Tabs>
    </MemoryRouter>,
  );
}

describe("ConfiguracoesTabGeral", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.fontSize = "";
    delete document.documentElement.dataset.movimento;
  });

  it("tamanho do texto muda a escala do app e fica guardado neste computador", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("radio", { name: "Maior" }));
    expect(document.documentElement.style.fontSize).toBe("125%");
    expect(localStorage.getItem("autoos:tamanho-texto")).toBe("maior");
    await user.click(screen.getByRole("radio", { name: "Normal" }));
    expect(document.documentElement.style.fontSize).toBe("100%");
    expect(localStorage.getItem("autoos:tamanho-texto")).toBeNull();
  });

  it("reduzir animações marca o documento", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("checkbox", { name: "Reduzir animações" }));
    expect(document.documentElement.dataset.movimento).toBe("reduzido");
    await user.click(screen.getByRole("checkbox", { name: "Reduzir animações" }));
    expect(document.documentElement.dataset.movimento).toBeUndefined();
  });

  it("sons, aviso do Windows e tela inicial ficam no localStorage", async () => {
    const user = userEvent.setup();
    renderizar();
    await user.click(screen.getByRole("checkbox", { name: "Sons da interface" }));
    expect(localStorage.getItem("autoos:ui-sounds")).toBe("off");
    await user.click(screen.getByRole("checkbox", { name: "Avisar no Windows" }));
    expect(localStorage.getItem("autoos:avisos-windows")).toBe("off");
    await user.click(screen.getByRole("radio", { name: "Equipamentos" }));
    expect(localStorage.getItem("autoos:tela-inicial")).toBe("equipamentos");
  });

  it("no modo Balcão some a escolha da tela inicial", async () => {
    localStorage.setItem("autoos_app_mode", "counter");
    renderizar();
    expect(screen.queryByRole("radiogroup", { name: "Abrir o app em" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Balcão" })).toHaveAttribute("aria-checked", "true");
  });

  it("mostra a conexão sem endereço nem credencial", () => {
    renderizar(false);
    expect(screen.getByText("Sem conexão com o servidor")).toBeInTheDocument();
    expect(screen.getByText("painel de versão")).toBeInTheDocument();
  });
});
