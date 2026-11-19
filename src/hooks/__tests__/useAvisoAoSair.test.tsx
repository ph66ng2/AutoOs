import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createMemoryRouter, Link, RouterProvider, useNavigate } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useAvisoAoSair } from "../useAvisoAoSair";

function Formulario() {
  const [texto, setTexto] = useState("");
  const navigate = useNavigate();
  const aviso = useAvisoAoSair(texto !== "", (destino) => destino === "/origem");
  return (
    <div>
      <input aria-label="campo" value={texto} onChange={(event) => setTexto(event.target.value)} />
      <Link to="/outra">Ir para outra</Link>
      <Link to="/origem">Cancelar</Link>
      <button type="button" onClick={() => { aviso.liberarProximaSaida(); navigate("/outra"); }}>Salvar</button>
      {aviso.dialogo}
    </div>
  );
}

function montar() {
  const router = createMemoryRouter(
    [
      { path: "/form", element: <Formulario /> },
      { path: "/outra", element: <p>Outra tela</p> },
      { path: "/origem", element: <p>Origem</p> },
    ],
    { initialEntries: ["/form"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("useAvisoAoSair", () => {
  it("formulário limpo sai sem aviso", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByText("Ir para outra"));
    expect(screen.getByText("Outra tela")).toBeInTheDocument();
  });

  it("formulário preenchido avisa; continuar editando fica, sair sem salvar sai", async () => {
    const user = userEvent.setup();
    const router = montar();
    await user.type(screen.getByLabelText("campo"), "abc");
    await user.click(screen.getByText("Ir para outra"));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(router.state.location.pathname).toBe("/form");
    expect(screen.getByLabelText("campo")).toHaveValue("abc");

    await user.click(screen.getByText("Ir para outra"));
    await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(await screen.findByText("Outra tela")).toBeInTheDocument();
  });

  it("saída livre e salvar passam sem aviso", async () => {
    const user = userEvent.setup();
    const router = montar();
    await user.type(screen.getByLabelText("campo"), "abc");
    await user.click(screen.getByText("Cancelar"));
    expect(screen.getByText("Origem")).toBeInTheDocument();

    await act(() => router.navigate("/form"));
    await user.type(screen.getByLabelText("campo"), "x");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("Outra tela")).toBeInTheDocument();
  });
});
