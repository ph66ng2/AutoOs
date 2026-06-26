import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "@/components/ui/tabs";
import { ConfiguracoesTabSeguranca, type ConfiguracoesTabSegurancaProps } from "../ConfiguracoesTabSeguranca";

const baseProps: ConfiguracoesTabSegurancaProps = {
  canManageProfiles: true,
  securityAdminUnlocked: true,
  securityBusy: false,
  handleSecurityAdminToggle: vi.fn(),
  accessStatus: null,
  trocarPerfilAtivo: vi.fn(),
  currentPin: "",
  setCurrentPin: vi.fn(),
  newPin: "",
  setNewPin: vi.fn(),
  confirmPin: "",
  setConfirmPin: vi.fn(),
  trocarMeuPin: vi.fn(),
  managedProfileId: null,
  setManagedProfileId: vi.fn(),
  profilesCatalog: [],
  managedProfile: null,
  editProfileName: "",
  setEditProfileName: vi.fn(),
  editProfileRole: "CUSTOM",
  setEditProfileRole: vi.fn(),
  editPermissions: [],
  setEditPermissions: vi.fn(),
  permissionOptions: [],
  togglePermission: vi.fn(),
  desativarPerfilSelecionado: vi.fn(),
  reativarPerfilSelecionado: vi.fn(),
  salvarPerfilAtual: vi.fn(),
  resetPin: "",
  setResetPin: vi.fn(),
  resetPinConfirm: "",
  setResetPinConfirm: vi.fn(),
  resetarPinPerfil: vi.fn(),
  newProfileName: "",
  setNewProfileName: vi.fn(),
  newProfileRole: "CUSTOM",
  setNewProfileRole: vi.fn(),
  newProfilePermissions: [],
  setNewProfilePermissions: vi.fn(),
  newProfilePin: "",
  setNewProfilePin: vi.fn(),
  newProfilePinConfirm: "",
  setNewProfilePinConfirm: vi.fn(),
  newProfileNoPin: false,
  setNewProfileNoPin: vi.fn(),
  criarPerfil: vi.fn(),
  securityMessage: null,
  inactivityLockEnabled: false,
  onToggleInactivityLock: vi.fn(),
};

function renderWithTabs(ui: React.ReactElement) {
  return render(<Tabs defaultValue="seguranca">{ui}</Tabs>);
}

describe("ConfiguracoesTabSeguranca — inactivity lock toggle", () => {
  it("renderiza o card com titulo e descricao", () => {
    renderWithTabs(<ConfiguracoesTabSeguranca {...baseProps} />);

    const titulos = screen.getAllByText("Bloqueio por inatividade");
    expect(titulos.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByText((content) =>
        content.includes("Quando ativado") &&
        content.includes("pede PIN novamente") &&
        content.includes("15 minutos sem uso"),
      ),
    ).toBeInTheDocument();
  });

  it("toggle inicia desmarcado quando inactivityLockEnabled=false", () => {
    renderWithTabs(<ConfiguracoesTabSeguranca {...baseProps} inactivityLockEnabled={false} />);

    const checkbox = screen.getByRole("checkbox", { name: /bloqueio por inatividade/i });
    expect(checkbox).not.toBeChecked();
  });

  it("toggle inicia marcado quando inactivityLockEnabled=true", () => {
    renderWithTabs(<ConfiguracoesTabSeguranca {...baseProps} inactivityLockEnabled={true} />);

    const checkbox = screen.getByRole("checkbox", { name: /bloqueio por inatividade/i });
    expect(checkbox).toBeChecked();
  });

  it("chama onToggleInactivityLock ao clicar no toggle", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    renderWithTabs(
      <ConfiguracoesTabSeguranca
        {...baseProps}
        inactivityLockEnabled={false}
        onToggleInactivityLock={onToggle}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: /bloqueio por inatividade/i });
    await user.click(checkbox);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it("toggle fica desabilitado quando securityBusy=true", () => {
    renderWithTabs(
      <ConfiguracoesTabSeguranca
        {...baseProps}
        securityBusy={true}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: /bloqueio por inatividade/i });
    expect(checkbox).toBeDisabled();
  });

  it("toggle fica habilitado para admin quando nao esta ocupado", () => {
    renderWithTabs(
      <ConfiguracoesTabSeguranca
        {...baseProps}
        canManageProfiles={true}
        securityBusy={false}
      />,
    );

    const checkbox = screen.getByRole("checkbox", { name: /bloqueio por inatividade/i });
    expect(checkbox).toBeEnabled();
  });

  it("nao renderiza o card quando canManageProfiles=false", () => {
    renderWithTabs(
      <ConfiguracoesTabSeguranca
        {...baseProps}
        canManageProfiles={false}
      />,
    );

    expect(screen.queryByRole("heading", { name: /bloqueio por inatividade/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /bloqueio por inatividade/i })).not.toBeInTheDocument();
  });
});
