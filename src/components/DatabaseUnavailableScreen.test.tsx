import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DatabaseFallback,
  DatabaseUnavailableScreen,
  reconnectDelaySeconds,
  supportDetailsText,
} from "./DatabaseUnavailableScreen";
import { DatabaseConfigService, type DatabaseInitError } from "@/lib/db-config";

const redeError: DatabaseInitError = {
  tipo: "rede",
  mensagem: "Não foi possível alcançar o banco. Verifique a internet, DNS ou compatibilidade IPv4/IPv6.",
};

describe("reconnectDelaySeconds", () => {
  it("cresce até o teto e respeita o mínimo do servidor lotado", () => {
    expect([0, 1, 2, 3, 4, 9].map((attempt) => reconnectDelaySeconds(attempt, "rede"))).toEqual([5, 10, 20, 30, 30, 30]);
    expect(reconnectDelaySeconds(0, "capacidade")).toBe(30);
  });
});

describe("DatabaseUnavailableScreen", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("mostra a causa e reconecta pelo botão sem pedir URL", async () => {
    const reconnect = vi.spyOn(DatabaseConfigService, "reconnect").mockResolvedValue(null);
    const onConnected = vi.fn();
    const user = userEvent.setup();

    render(<DatabaseUnavailableScreen initialError={redeError} onConnected={onConnected} onOpenAdvanced={vi.fn()} />);

    expect(screen.getByText("Sem conexão com o servidor")).toBeInTheDocument();
    expect(screen.queryByLabelText("URL do banco")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it("tenta de novo sozinho depois da contagem e espera mais a cada falha", async () => {
    vi.useFakeTimers();
    const reconnect = vi.spyOn(DatabaseConfigService, "reconnect").mockResolvedValue(redeError);

    render(<DatabaseUnavailableScreen initialError={redeError} onConnected={vi.fn()} onOpenAdvanced={vi.fn()} />);

    expect(screen.getByTestId("reconnect-countdown")).toHaveTextContent("5 s");
    for (let second = 0; second < 5; second += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(reconnect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("reconnect-countdown")).toHaveTextContent("10 s");
  });

  it("nos estados que pedem o administrador, copiar detalhes é a ação principal", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(
      <DatabaseUnavailableScreen
        initialError={{ tipo: "incompativel", mensagem: "A conexão foi aberta, mas o banco não é compatível." }}
        onConnected={vi.fn()}
        onOpenAdvanced={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Banco de outra versão" })).toBeInTheDocument();
    const [primeiro, segundo] = screen.getAllByRole("button").filter((b) => /copiar|tentar/i.test(b.textContent ?? ""));
    expect(primeiro).toHaveTextContent("Copiar detalhes para o suporte");
    expect(segundo).toHaveTextContent("Tentar novamente");

    await user.click(primeiro);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Banco de outra versão");
    expect(writeText.mock.calls[0][0]).toContain("não é compatível");
  });

  it("guarda o detalhe técnico recolhido até pedirem", async () => {
    const user = userEvent.setup();

    render(<DatabaseUnavailableScreen initialError={redeError} onConnected={vi.fn()} onOpenAdvanced={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: "Detalhes para o suporte" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/compatibilidade IPv4\/IPv6/)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/compatibilidade IPv4\/IPv6/)).toBeInTheDocument();
  });

  it("não tenta sozinho quando o erro exige ajuste de configuração", () => {
    vi.useFakeTimers();
    const reconnect = vi.spyOn(DatabaseConfigService, "reconnect");

    render(
      <DatabaseUnavailableScreen
        initialError={{ tipo: "credencial", mensagem: "Usuário ou senha do banco inválidos." }}
        onConnected={vi.fn()}
        onOpenAdvanced={vi.fn()}
      />,
    );

    expect(screen.getByText(/chame o administrador/i)).toBeInTheDocument();
    expect(screen.queryByTestId("reconnect-countdown")).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(reconnect).not.toHaveBeenCalled();
  });
});

describe("supportDetailsText", () => {
  it("leva título, detalhe, versão e hora", () => {
    const texto = supportDetailsText(redeError, new Date(2026, 10, 18, 9, 30), "0.6.3");
    expect(texto).toContain("Sem conexão com o servidor");
    expect(texto).toContain(redeError.mensagem);
    expect(texto).toContain("Versão: 0.6.3");
    expect(texto).toContain("18/11/2026");
  });
});

describe("DatabaseFallback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("mostra o formulário quando não há configuração", async () => {
    vi.spyOn(DatabaseConfigService, "getInitializationError").mockResolvedValue({
      tipo: "nao_configurado",
      mensagem: "A URL de conexão PostgreSQL está ausente ou possui formato inválido.",
    });

    render(<DatabaseFallback onConnected={vi.fn()} />);

    expect(await screen.findByLabelText("URL do banco")).toBeInTheDocument();
  });

  it("esconde o formulário atrás da configuração avançada quando o servidor caiu", async () => {
    vi.spyOn(DatabaseConfigService, "getInitializationError").mockResolvedValue(redeError);
    vi.spyOn(DatabaseConfigService, "reconnect").mockResolvedValue(redeError);
    const user = userEvent.setup();

    render(<DatabaseFallback onConnected={vi.fn()} />);

    expect(await screen.findByText("Sem conexão com o servidor")).toBeInTheDocument();
    expect(screen.queryByLabelText("URL do banco")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /configuração avançada/i }));
    expect(await screen.findByLabelText("URL do banco")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /voltar e tentar/i }));
    expect(await screen.findByText("Sem conexão com o servidor")).toBeInTheDocument();
  });
});
