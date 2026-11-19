import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DatabaseConnectionAlertView } from "./DatabaseConnectionAlert";

const rede = { tipo: "rede" as const, mensagem: "Não foi possível alcançar o banco." };

describe("DatabaseConnectionAlertView", () => {
  it("não mostra nada com o banco ok", () => {
    const { container } = render(<DatabaseConnectionAlertView health={{ status: "ok" }} onRetry={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("queda passageira: âmbar, contagem e tentar agora", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <DatabaseConnectionAlertView
        health={{ status: "caiu", error: rede, downSince: Date.now(), reconnecting: false, secondsLeft: 7 }}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Sem conexão com o servidor");
    expect(screen.getByText(/O que você digitou continua aqui/)).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("Nova tentativa em 7 s");
    await user.click(screen.getByRole("button", { name: "Tentar agora" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("mostra há quanto tempo está sem conexão depois de 5 minutos", () => {
    render(
      <DatabaseConnectionAlertView
        health={{ status: "caiu", error: rede, downSince: Date.now() - 7 * 60_000, reconnecting: false, secondsLeft: 30 }}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Sem conexão há 7 min. Se continuar, chame o administrador.")).toBeInTheDocument();
  });

  it("erro que pede o administrador: sem contagem", () => {
    render(
      <DatabaseConnectionAlertView
        health={{
          status: "caiu",
          error: { tipo: "credencial", mensagem: "Usuário ou senha do banco inválidos." },
          downSince: Date.now() - 7 * 60_000,
          reconnecting: false,
          secondsLeft: null,
        }}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("O banco precisa de ajuste");
    expect(screen.getByText(/Chame o administrador/)).toBeInTheDocument();
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.queryByText(/Sem conexão há/)).not.toBeInTheDocument();
  });

  it("durante a tentativa o botão fica ocupado", () => {
    render(
      <DatabaseConnectionAlertView
        health={{ status: "caiu", error: rede, downSince: Date.now(), reconnecting: true, secondsLeft: null }}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Tentar agora" })).toBeDisabled();
    expect(screen.getByRole("timer")).toHaveTextContent("Conectando...");
  });

  it("avisa quando a conexão volta", () => {
    render(<DatabaseConnectionAlertView health={{ status: "restabelecida" }} onRetry={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Conexão restabelecida");
  });
});
