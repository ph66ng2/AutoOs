import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProfileSessionDialog } from "../ProfileSessionDialog";
import type { SecurityProfile } from "@/types";

const baseProfile: SecurityProfile = {
  id: 1,
  nome: "Admin",
  role: "ADMIN",
  permissions: ["MANAGE_PROFILES"],
  pin_configured: true,
  is_default: false,
  ativo: true,
};

const noPinProfile: SecurityProfile = {
  id: 2,
  nome: "Operador",
  role: "CUSTOM",
  permissions: ["STOCK_CONTROL"],
  pin_configured: false,
  is_default: false,
  ativo: true,
};

const noPinProfile2: SecurityProfile = {
  id: 3,
  nome: "Recepcao",
  role: "CUSTOM",
  permissions: [],
  pin_configured: false,
  is_default: false,
  ativo: true,
};

function renderDialog(props: Partial<React.ComponentProps<typeof ProfileSessionDialog>> = {}) {
  const defaults: React.ComponentProps<typeof ProfileSessionDialog> = {
    open: true,
    mandatory: true,
    mode: "startup",
    title: "Entrada do aplicativo",
    description: "Selecione um perfil para continuar.",
    profiles: [baseProfile, noPinProfile],
    activeProfileId: null,
    unlocked: false,
    selectedProfileId: "",
    selectedProfile: null,
    pin: "",
    confirmPin: "",
    busy: false,
    error: null,
    onClose: vi.fn(),
    onSelectProfile: vi.fn(),
    onPinChange: vi.fn(),
    onConfirmPinChange: vi.fn(),
    onSubmit: vi.fn(),
    onQuickLoginNoPin: vi.fn(),
  };

  return render(<ProfileSessionDialog {...defaults} {...props} />);
}

describe("ProfileSessionDialog dropdown login sem PIN", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exibe dropdown de login rápido quando há perfis sem PIN", () => {
    renderDialog();
    expect(screen.getByLabelText(/login rápido/i)).toBeInTheDocument();
  });

  it("NÃO exibe dropdown quando todos os perfis têm PIN", () => {
    renderDialog({
      profiles: [baseProfile, { ...noPinProfile, pin_configured: true }],
    });
    expect(screen.queryByLabelText(/login rápido/i)).not.toBeInTheDocument();
  });

  it("lista apenas perfis sem PIN no dropdown", () => {
    renderDialog({ profiles: [baseProfile, noPinProfile, noPinProfile2] });

    const select = screen.getByRole("combobox", { name: /login rápido/i });
    const options = Array.from(select.querySelectorAll("option")).filter((opt) => opt.value !== "");

    expect(options.map((opt) => opt.textContent)).toContain("Operador");
    expect(options.map((opt) => opt.textContent)).toContain("Recepcao");
    expect(options.map((opt) => opt.textContent)).not.toContain("Admin");
  });

  it("chama onQuickLoginNoPin ao selecionar um perfil do dropdown", async () => {
    const onQuickLoginNoPin = vi.fn();
    renderDialog({ onQuickLoginNoPin, profiles: [baseProfile, noPinProfile] });

    const select = screen.getByRole("combobox", { name: /login rápido/i });
    await userEvent.selectOptions(select, "2");

    expect(onQuickLoginNoPin).toHaveBeenCalledTimes(1);
    expect(onQuickLoginNoPin).toHaveBeenCalledWith("2");
  });

  it("perfis COM PIN continuam exibindo campo de PIN no painel direito", () => {
    renderDialog({
      selectedProfileId: "1",
      selectedProfile: baseProfile,
    });

    expect(screen.getByLabelText(/pin do perfil/i)).toBeInTheDocument();
  });

  it("ao selecionar perfil sem PIN pela lista normal, ainda exibe campo de PIN (para configuração)", () => {
    renderDialog({
      selectedProfileId: "2",
      selectedProfile: noPinProfile,
    });

    expect(screen.getByLabelText(/pin do perfil/i)).toBeInTheDocument();
  });

  it("dropdown não aparece quando a lista de perfis sem PIN está vazia", () => {
    renderDialog({ profiles: [baseProfile] });
    expect(screen.queryByLabelText(/login rápido/i)).not.toBeInTheDocument();
  });
});
