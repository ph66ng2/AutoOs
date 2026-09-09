import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseConfigDialog } from "./DatabaseConfigDialog";
import { DatabaseConfigService } from "@/lib/db-config";

describe("DatabaseConfigDialog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("inicializa e persiste a URL com uma única chamada backend", async () => {
    vi.spyOn(DatabaseConfigService, "getInitializationError").mockResolvedValue(null);
    const restart = vi
      .spyOn(DatabaseConfigService, "restartWithConfig")
      .mockResolvedValue(true);
    const test = vi.spyOn(DatabaseConfigService, "test");
    const save = vi.spyOn(DatabaseConfigService, "save");
    const user = userEvent.setup();

    render(<DatabaseConfigDialog onConfigured={vi.fn()} />);
    await user.type(
      screen.getByLabelText("URL de Conexão PostgreSQL"),
      "postgresql://postgres.projeto:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
    );
    await user.click(screen.getByRole("button", { name: "Conectar ao Banco" }));

    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));
    expect(test).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(await screen.findByText("Conectado com sucesso! Abrindo o app...")).toBeInTheDocument();
  });

  it("mostra a causa sanitizada do erro da primeira abertura", async () => {
    vi.spyOn(DatabaseConfigService, "getInitializationError").mockResolvedValue(
      "Não foi possível alcançar o banco. Verifique a internet, DNS ou compatibilidade IPv4/IPv6.",
    );

    render(<DatabaseConfigDialog onConfigured={vi.fn()} />);

    expect(await screen.findByText(/compatibilidade IPv4\/IPv6/)).toBeInTheDocument();
  });
});
