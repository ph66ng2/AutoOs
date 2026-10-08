import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileSessionDialog } from "../ProfileSessionDialog";
import type { SecurityProfile } from "@/types";

const admin: SecurityProfile = {
  id: 1, nome: "Administrador Local", role: "ADMIN", permissions: [],
  pin_configured: false, is_default: true, ativo: true,
};

const defaults: React.ComponentProps<typeof ProfileSessionDialog> = {
  open: true, mandatory: true, mode: "startup", title: "Entrada", description: "Escolha um perfil",
  profiles: [admin], activeProfileId: 1, unlocked: false,
  selectedProfileId: "1", selectedProfile: admin,
  pin: "1234", confirmPin: "4321", busy: false, error: null,
  onClose: vi.fn(), onSelectProfile: vi.fn(), onPinChange: vi.fn(), onConfirmPinChange: vi.fn(), onSubmit: vi.fn(),
};

describe("confirmação de sessão", () => {
  it("impede criar o PIN inicial quando a confirmação diverge", () => {
    render(<ProfileSessionDialog {...defaults} />);
    expect(screen.getByRole("button", { name: /Criar meu acesso e entrar/i })).toBeDisabled();
  });

  it("não anuncia zero permissões quando a sessão ainda está bloqueada", () => {
    render(<ProfileSessionDialog {...defaults} profiles={[admin, { ...admin, id: 2, nome: "Operador", role: "CUSTOM", is_default: false, pin_configured: true }]} selectedProfile={null} selectedProfileId="" />);
    expect(screen.queryByText(/0 permissões configuradas/)).not.toBeInTheDocument();
  });

  it("não mostra a dica de sucesso junto de um erro de acesso", () => {
    const current = { ...admin, pin_configured: true };
    render(<ProfileSessionDialog {...defaults} mode="selector" profiles={[current]} selectedProfile={current} error="O banco atingiu o limite de acessos ao mesmo tempo." />);
    expect(screen.getByText(/O banco atingiu o limite/)).toBeInTheDocument();
    expect(screen.queryByText(/Você já está neste perfil/)).not.toBeInTheDocument();
  });
});
