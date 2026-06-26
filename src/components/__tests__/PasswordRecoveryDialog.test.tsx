import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordRecoveryDialog } from "../PasswordRecoveryDialog";
import type { SecurityProfile, DatabaseConnectionConfig } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { db } from "@/lib/db";

const mockProfiles: SecurityProfile[] = [
  {
    id: 1,
    nome: "Admin",
    role: "ADMIN",
    permissions: ["MANAGE_PROFILES"],
    pin_configured: true,
    is_default: false,
    ativo: true,
  },
  {
    id: 2,
    nome: "Operador",
    role: "CUSTOM",
    permissions: ["STOCK_CONTROL"],
    pin_configured: false,
    is_default: false,
    ativo: true,
  },
  {
    id: 3,
    nome: "Inativo",
    role: "CUSTOM",
    permissions: [],
    pin_configured: true,
    is_default: false,
    ativo: false,
  },
];

const mockConfig: DatabaseConnectionConfig = {
  host: "192.168.1.10",
  port: 5432,
  database: "autoos_prod",
  username: "autoos_user",
  password: "",
};

function renderDialog(props: Partial<React.ComponentProps<typeof PasswordRecoveryDialog>> = {}) {
  const defaults: React.ComponentProps<typeof PasswordRecoveryDialog> = {
    open: true,
    profiles: mockProfiles,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };
  return render(<PasswordRecoveryDialog {...defaults} {...props} />);
}

function mockCmd(responses: Record<string, unknown>) {
  mockInvoke.mockImplementation((cmd: string) => Promise.resolve(responses[cmd]));
}

describe("PasswordRecoveryDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockInvoke.mockReset();
    mockInvoke.mockImplementation(() => Promise.resolve(undefined));
  });

  describe("Step 1 — Credenciais PostgreSQL", () => {
    it("renderiza formulário de credenciais ao abrir", async () => {
      mockCmd({});
      renderDialog();

      expect(await screen.findByText(/Recuperação de PIN/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Host/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Porta/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Banco de Dados/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Usuário/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Senha/i)).toBeInTheDocument();
    });

    it("preenche host, porta, banco e usuário da config existente", async () => {
      mockCmd({ "carregar_config_banco": mockConfig });
      renderDialog();

      const hostInput = await screen.findByLabelText(/Host/i);
      expect(hostInput).toHaveValue("192.168.1.10");
      expect(screen.getByLabelText(/Porta/i)).toHaveValue(5432);
      expect(screen.getByLabelText(/Banco de Dados/i)).toHaveValue("autoos_prod");
      expect(screen.getByLabelText(/Usuário/i)).toHaveValue("autoos_user");
      expect(screen.getByLabelText(/Senha/i)).toHaveValue("");
    });

    it("mantém campos com fallback quando não há config", async () => {
      mockCmd({});
      renderDialog();

      const hostInput = await screen.findByLabelText(/Host/i);
      expect(hostInput).toHaveValue("");
    });

    it("avanca para step 2 quando credenciais sao validas", async () => {
      mockCmd({
        "carregar_config_banco": mockConfig,
        "verificar_credenciais_banco": true,
      });
      renderDialog();

      await screen.findByLabelText(/Host/i);

      const passwordInput = screen.getByLabelText(/Senha/i);
      await userEvent.type(passwordInput, "secret123");

      const submitButton = screen.getByRole("button", { name: /Verificar credenciais/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Selecione o perfil/i)).toBeInTheDocument();
      });
    });

    it("exibe erro quando credenciais sao invalidas", async () => {
      mockCmd({
        "carregar_config_banco": mockConfig,
        "verificar_credenciais_banco": false,
      });
      renderDialog();

      await screen.findByLabelText(/Host/i);

      const passwordInput = screen.getByLabelText(/Senha/i);
      await userEvent.type(passwordInput, "wrongpass");

      const submitButton = screen.getByRole("button", { name: /Verificar credenciais/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Credenciais inválidas/i)).toBeInTheDocument();
      });
    });

    it("exibe erro quando invoke rejeita na verificacao", async () => {
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "carregar_config_banco") return Promise.resolve(mockConfig);
        return Promise.reject(new Error("Timeout"));
      });
      renderDialog();

      await screen.findByLabelText(/Host/i);

      const passwordInput = screen.getByLabelText(/Senha/i);
      await userEvent.type(passwordInput, "secret123");

      const submitButton = screen.getByRole("button", { name: /Verificar credenciais/i });
      await userEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Error: Timeout/i)).toBeInTheDocument();
      });
    });

    it("chama onClose ao clicar em Fechar no step 1", async () => {
      mockCmd({});
      const onClose = vi.fn();
      renderDialog({ onClose });

      await screen.findByLabelText(/Host/i);

      const closeButton = screen.getByRole("button", { name: /Fechar/i });
      await userEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("Step 2 — Perfil e novo PIN", () => {
    async function reachStep2() {
      mockCmd({
        "carregar_config_banco": mockConfig,
        "verificar_credenciais_banco": true,
      });
      renderDialog();

      await screen.findByLabelText(/Host/i);
      await userEvent.type(screen.getByLabelText(/Senha/i), "secret123");
      await userEvent.click(screen.getByRole("button", { name: /Verificar credenciais/i }));

      await waitFor(() => {
        expect(screen.getByText(/Selecione o perfil/i)).toBeInTheDocument();
      });
    }

    it("lista apenas perfis ativos no dropdown", async () => {
      await reachStep2();

      const select = screen.getByRole("combobox", { name: /Perfil/i });
      const options = Array.from(select.querySelectorAll("option")).filter((opt) => opt.value !== "");

      expect(options.map((opt) => opt.textContent)).toContain("Admin (ADMIN)");
      expect(options.map((opt) => opt.textContent)).toContain("Operador (CUSTOM)");
      expect(options.map((opt) => opt.textContent)).not.toContain("Inativo (CUSTOM)");
    });

    it("exibe erro quando PINs nao coincidem", async () => {
      await reachStep2();

      const select = screen.getByRole("combobox", { name: /Perfil/i });
      await userEvent.selectOptions(select, "1");

      await userEvent.type(screen.getByLabelText(/Novo PIN/i), "1234");
      await userEvent.type(screen.getByLabelText(/Confirmar PIN/i), "5678");

      await userEvent.click(screen.getByRole("button", { name: /Redefinir PIN/i }));

      await waitFor(() => {
        expect(screen.getByText(/PINs não coincidem/i)).toBeInTheDocument();
      });
    });

    it("exibe erro quando PIN tem menos de 4 digitos", async () => {
      await reachStep2();

      const select = screen.getByRole("combobox", { name: /Perfil/i });
      await userEvent.selectOptions(select, "1");

      await userEvent.type(screen.getByLabelText(/Novo PIN/i), "12");
      await userEvent.type(screen.getByLabelText(/Confirmar PIN/i), "12");

      await userEvent.click(screen.getByRole("button", { name: /Redefinir PIN/i }));

      await waitFor(() => {
        expect(screen.getByText(/PIN deve ter entre 4 e 8 dígitos/i)).toBeInTheDocument();
      });
    });

    it("avanca para step 3 quando redefine PIN com sucesso", async () => {
      await reachStep2();

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "redefinir_pin_via_db") return Promise.resolve(true);
        return Promise.resolve(undefined);
      });

      const select = screen.getByRole("combobox", { name: /Perfil/i });
      await userEvent.selectOptions(select, "1");

      await userEvent.type(screen.getByLabelText(/Novo PIN/i), "1234");
      await userEvent.type(screen.getByLabelText(/Confirmar PIN/i), "1234");

      await userEvent.click(screen.getByRole("button", { name: /Redefinir PIN/i }));

      await waitFor(() => {
        expect(screen.getByText(/PIN redefinido com sucesso/i)).toBeInTheDocument();
      });
    });

    it("exibe erro quando redefinirPinViaDb retorna false", async () => {
      await reachStep2();

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "redefinir_pin_via_db") return Promise.resolve(false);
        return Promise.resolve(undefined);
      });

      const select = screen.getByRole("combobox", { name: /Perfil/i });
      await userEvent.selectOptions(select, "1");

      await userEvent.type(screen.getByLabelText(/Novo PIN/i), "1234");
      await userEvent.type(screen.getByLabelText(/Confirmar PIN/i), "1234");

      await userEvent.click(screen.getByRole("button", { name: /Redefinir PIN/i }));

      await waitFor(() => {
        expect(screen.getByText(/Não foi possível redefinir o PIN/i)).toBeInTheDocument();
      });
    });

    it("exibe erro quando redefinirPinViaDb rejeita", async () => {
      await reachStep2();

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "redefinir_pin_via_db") return Promise.reject(new Error("DB offline"));
        return Promise.resolve(undefined);
      });

      const select = screen.getByRole("combobox", { name: /Perfil/i });
      await userEvent.selectOptions(select, "1");

      await userEvent.type(screen.getByLabelText(/Novo PIN/i), "1234");
      await userEvent.type(screen.getByLabelText(/Confirmar PIN/i), "1234");

      await userEvent.click(screen.getByRole("button", { name: /Redefinir PIN/i }));

      await waitFor(() => {
        expect(screen.getByText(/Error: DB offline/i)).toBeInTheDocument();
      });
    });

    it("volta para step 1 ao clicar em Voltar", async () => {
      await reachStep2();

      await userEvent.click(screen.getByRole("button", { name: /Voltar/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/Host/i)).toBeInTheDocument();
      });
    });

    it("exibe erro quando nenhum perfil é selecionado", async () => {
      await reachStep2();

      await userEvent.type(screen.getByLabelText(/Novo PIN/i), "1234");
      await userEvent.type(screen.getByLabelText(/Confirmar PIN/i), "1234");

      await userEvent.click(screen.getByRole("button", { name: /Redefinir PIN/i }));

      await waitFor(() => {
        expect(screen.getByText(/Selecione um perfil/i)).toBeInTheDocument();
      });
    });
  });

  describe("Step 3 — Sucesso", () => {
    async function reachStep3() {
      mockCmd({
        "carregar_config_banco": mockConfig,
        "verificar_credenciais_banco": true,
        "redefinir_pin_via_db": true,
      });
      renderDialog();

      await screen.findByLabelText(/Host/i);
      await userEvent.type(screen.getByLabelText(/Senha/i), "secret123");
      await userEvent.click(screen.getByRole("button", { name: /Verificar credenciais/i }));

      await waitFor(() => {
        expect(screen.getByText(/Selecione o perfil/i)).toBeInTheDocument();
      });

      await userEvent.selectOptions(screen.getByRole("combobox", { name: /Perfil/i }), "1");
      await userEvent.type(screen.getByLabelText(/Novo PIN/i), "1234");
      await userEvent.type(screen.getByLabelText(/Confirmar PIN/i), "1234");
      await userEvent.click(screen.getByRole("button", { name: /Redefinir PIN/i }));

      await waitFor(() => {
        expect(screen.getByText(/PIN redefinido com sucesso/i)).toBeInTheDocument();
      });
    }

    it("exibe mensagem de sucesso e icem check", async () => {
      await reachStep3();
      expect(screen.getByText(/PIN redefinido com sucesso/i)).toBeInTheDocument();
    });

    it("fecha automaticamente após 2 segundos", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      mockCmd({
        "carregar_config_banco": mockConfig,
        "verificar_credenciais_banco": true,
        "redefinir_pin_via_db": true,
      });

      const onClose = vi.fn();
      const onSuccess = vi.fn();
      renderDialog({ onClose, onSuccess });

      await screen.findByLabelText(/Host/i);
      await userEvent.type(screen.getByLabelText(/Senha/i), "secret123");
      await userEvent.click(screen.getByRole("button", { name: /Verificar credenciais/i }));

      await waitFor(() => {
        expect(screen.getByText(/Selecione o perfil/i)).toBeInTheDocument();
      });

      await userEvent.selectOptions(screen.getByRole("combobox", { name: /Perfil/i }), "1");
      await userEvent.type(screen.getByLabelText(/Novo PIN/i), "1234");
      await userEvent.type(screen.getByLabelText(/Confirmar PIN/i), "1234");

      fireEvent.click(screen.getByRole("button", { name: /Redefinir PIN/i }));

      await waitFor(() => {
        expect(screen.getByText(/PIN redefinido com sucesso/i)).toBeInTheDocument();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2500);
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it("fecha imediatamente ao clicar em Entrar", async () => {
      mockCmd({
        "carregar_config_banco": mockConfig,
        "verificar_credenciais_banco": true,
        "redefinir_pin_via_db": true,
      });

      const onClose = vi.fn();
      const onSuccess = vi.fn();
      renderDialog({ onClose, onSuccess });

      await screen.findByLabelText(/Host/i);
      await userEvent.type(screen.getByLabelText(/Senha/i), "secret123");
      await userEvent.click(screen.getByRole("button", { name: /Verificar credenciais/i }));

      await waitFor(() => {
        expect(screen.getByText(/Selecione o perfil/i)).toBeInTheDocument();
      });

      await userEvent.selectOptions(screen.getByRole("combobox", { name: /Perfil/i }), "1");
      await userEvent.type(screen.getByLabelText(/Novo PIN/i), "1234");
      await userEvent.type(screen.getByLabelText(/Confirmar PIN/i), "1234");
      await userEvent.click(screen.getByRole("button", { name: /Redefinir PIN/i }));

      await waitFor(() => {
        expect(screen.getByText(/PIN redefinido com sucesso/i)).toBeInTheDocument();
      });

      const enterButton = screen.getByRole("button", { name: /Entrar/i });
      await userEvent.click(enterButton);

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe("limite de digitos no PIN", () => {
    it("restringe PIN a no maximo 8 digitos numericos", async () => {
      mockCmd({
        "carregar_config_banco": mockConfig,
        "verificar_credenciais_banco": true,
      });
      renderDialog();

      await screen.findByLabelText(/Host/i);
      await userEvent.type(screen.getByLabelText(/Senha/i), "secret123");
      await userEvent.click(screen.getByRole("button", { name: /Verificar credenciais/i }));

      await waitFor(() => {
        expect(screen.getByText(/Selecione o perfil/i)).toBeInTheDocument();
      });

      const pinInput = screen.getByLabelText(/Novo PIN/i);
      await userEvent.type(pinInput, "1234567890123");

      expect(pinInput).toHaveValue("12345678");
    });
  });
});
