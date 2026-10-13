import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SensitiveAccessProvider } from "@/hooks/useSensitiveAccess";
import App from "@/App";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("@/pages/Dashboard", () => ({ default: () => "Painel operacional" }));
vi.mock("@/pages/Equipamentos", () => ({ default: () => null }));
vi.mock("@/pages/Clientes", () => ({ default: () => null }));
vi.mock("@/pages/Insumos", () => ({ default: () => null }));
vi.mock("@/pages/Servicos", () => ({ default: () => null }));
vi.mock("@/pages/Gastos", () => ({ default: () => null }));
vi.mock("@/pages/Configuracoes", () => ({ default: () => null }));
vi.mock("@/pages/Perfil", () => ({ default: () => null }));
vi.mock("@/pages/Balcao", () => ({ default: () => null }));
vi.mock("@/poc/PowerSyncPOC", () => ({ default: () => null }));

const perfil = {
  id: 1,
  nome: "Admin",
  role: "ADMIN",
  permissions: [],
  pin_configured: true,
  is_default: true,
  ativo: true,
};

const bloqueado = {
  pin_configured: true,
  unlocked: false,
  expires_at: null,
  active_profile_id: 1,
  active_profile_name: "Admin",
  active_role: "ADMIN",
  permissions: [],
  can_manage_profiles: false,
  profiles: [perfil],
};

describe("cancelar o primeiro PIN", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    localStorage.clear();
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === "verificar_status_banco") return true;
      if (command === "get_sensitive_access_status") return bloqueado;
      return null;
    });
  });

  it("sai do splash para a tela de PIN e não abre o atendimento", async () => {
    const user = userEvent.setup();
    render(
      <SensitiveAccessProvider>
        <App />
      </SensitiveAccessProvider>,
    );

    const cancelar = await screen.findByRole("button", { name: "Cancelar" });
    await user.click(cancelar);

    expect(await screen.findByRole("heading", { name: "Informe o PIN para entrar" }, { timeout: 8000 })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("status", { name: /carregando aplicativo/i })).not.toBeInTheDocument();
    }, { timeout: 8000 });
    expect(screen.getByText(/continua bloqueado/i)).toBeInTheDocument();
    expect(screen.queryByText("Painel operacional")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Entrar com PIN" }));
    expect(await screen.findByRole("heading", { name: "Selecionar perfil da sessão" })).toBeInTheDocument();
    expect(screen.queryByText("Painel operacional")).not.toBeInTheDocument();
  });
});
