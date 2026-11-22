import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseConfigDialog } from "./DatabaseConfigDialog";
import { DatabaseConfigService } from "@/lib/db-config";

describe("DatabaseConfigDialog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("inicializa e persiste a URL com uma única chamada backend", async () => {
    const restart = vi
      .spyOn(DatabaseConfigService, "restartWithConfig")
      .mockResolvedValue(true);
    const test = vi.spyOn(DatabaseConfigService, "test");
    const save = vi.spyOn(DatabaseConfigService, "save");
    const user = userEvent.setup();

    render(<DatabaseConfigDialog onConfigured={vi.fn()} />);
    await user.type(
      screen.getByLabelText("URL do banco"),
      "postgresql://postgres.projeto:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    );
    await user.click(screen.getByRole("button", { name: "Conectar ao banco" }));

    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(test).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByText("Conectado. Abrindo o AutoOS...")).toBeInTheDocument();
  });

  it("recusa URL fora do formato sem chamar o backend", async () => {
    const restart = vi.spyOn(DatabaseConfigService, "restartWithConfig");
    const user = userEvent.setup();

    render(<DatabaseConfigDialog onConfigured={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Conectar o AutoOS a um banco" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("URL do banco"), "postgres:/usuario@host");
    await user.click(screen.getByRole("button", { name: "Conectar ao banco" }));

    expect(await screen.findByText(/Formato inválido/)).toBeInTheDocument();
    expect(screen.getByLabelText("URL do banco")).toHaveAttribute("aria-invalid", "true");
    expect(restart).not.toHaveBeenCalled();
  });

  it("no modo de suporte tem título próprio e volta para a tela de falha", async () => {
    const onCancel = vi.fn();
    const user = userEvent.setup();

    render(<DatabaseConfigDialog onConfigured={vi.fn()} onCancel={onCancel} />);
    expect(screen.getByRole("heading", { name: "Configuração de suporte" })).toBeInTheDocument();
    expect(screen.queryByText(/Bem-vindo/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /voltar e tentar/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
