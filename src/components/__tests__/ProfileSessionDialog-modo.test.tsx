import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProfileSessionDialog } from "../ProfileSessionDialog";
import type { SecurityProfile } from "@/types";

const marina: SecurityProfile = {
  id: 2, nome: "Marina Souza", role: "ATENDENTE", permissions: [],
  pin_configured: true, pin_required: true, is_default: false, ativo: true,
};

const props: React.ComponentProps<typeof ProfileSessionDialog> = {
  open: true, mandatory: true, mode: "startup", title: "Quem está usando o AutoOS?", description: "Escolha seu perfil",
  profiles: [marina], activeProfileId: null, unlocked: false,
  selectedProfileId: "2", selectedProfile: marina,
  pin: "2580", confirmPin: "", busy: false, error: null,
  onClose: vi.fn(), onSelectProfile: vi.fn(), onPinChange: vi.fn(), onConfirmPinChange: vi.fn(), onSubmit: vi.fn(),
};

describe("entrada: modo deste computador", () => {
  beforeEach(() => {
    localStorage.removeItem("autoos_app_mode");
    vi.clearAllMocks();
  });

  it("no login, escolher Balcão grava o modo e entra", () => {
    const onSubmit = vi.fn();
    render(<ProfileSessionDialog {...props} onSubmit={onSubmit} />);
    expect(screen.getByLabelText("PIN do perfil")).toBeInTheDocument();
    expect(screen.getByText("PIN de Marina")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Modo completo/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: /Balcão/ }));
    fireEvent.click(screen.getByRole("button", { name: "Entrar com este perfil" }));
    expect(localStorage.getItem("autoos_app_mode")).toBe("counter");
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("na troca de perfil (seletor) não aparece a escolha de modo", () => {
    render(<ProfileSessionDialog {...props} mode="selector" />);
    expect(screen.queryByRole("radiogroup", { name: "Entrar no" })).toBeNull();
  });
});
