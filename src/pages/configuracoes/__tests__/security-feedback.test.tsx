import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Tabs } from "@/components/ui/tabs";
import { ConfiguracoesTabSeguranca, type ConfiguracoesTabSegurancaProps } from "../ConfiguracoesTabSeguranca";
vi.mock("@/components/ProfileDeleteDialog", () => ({ ProfileDeleteDialog: () => null }));
const baseProps: ConfiguracoesTabSegurancaProps = {
  canManageProfiles: true,
  securityAdminUnlocked: true,
  securityBusy: false,
  handleSecurityAdminToggle: vi.fn(),
  accessStatus: null,
  currentPin: "",
  setCurrentPin: vi.fn(),
  newPin: "",
  setNewPin: vi.fn(),
  confirmPin: "",
  setConfirmPin: vi.fn(),
  trocarMeuPin: vi.fn(),
  managedProfileId: 2,
  setManagedProfileId: vi.fn(),
  profilesCatalog: [],
  managedProfile: { id: 2, nome: "Ivan", role: "TECNICO", permissions: [], pin_configured: true, pin_required: true, ativo: true, is_default: false },
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
  securityMessage: null,
  inactivityLockEnabled: false,
  onToggleInactivityLock: vi.fn(),
  deleteDialogOpen: false,
  onDeleteDialogOpenChange: vi.fn(),
  onDeleteSuccess: vi.fn(),
  adminPinVerify: "",
  setAdminPinVerify: vi.fn(),
  resetAdminPin: "",
  setResetAdminPin: vi.fn(),
};

function SecurityForm({ initialMessage = "Perfil atualizado com sucesso.", variant = "success" }: { initialMessage?: string; variant?: "success" | "error" }) {
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [editPin, setEditPin] = useState("");
  const [resetPin, setResetPin] = useState("");
  return <MemoryRouter><Tabs defaultValue="seguranca"><ConfiguracoesTabSeguranca {...baseProps} adminPinVerify={editPin} setAdminPinVerify={setEditPin} resetAdminPin={resetPin} setResetAdminPin={setResetPin} securityMessage={message} securityMessageVariant={variant} onClearSecurityMessage={() => setMessage(null)} /></Tabs></MemoryRouter>;
}
describe("retorno e credenciais administrativas de segurança", () => {
  it("destaca o PIN administrativo inválido como erro e limpa ao corrigir o campo", async () => {
    const user = userEvent.setup();
    render(<SecurityForm initialMessage="PIN do administrador inválido" variant="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("PIN do administrador inválido");
    await user.type(screen.getByLabelText("Seu PIN de administrador", { selector: "#admin-pin-edit" }), "1234");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("apresenta sucesso com o papel de status", () => {
    render(<SecurityForm />);
    expect(screen.getByRole("status")).toHaveTextContent("Perfil atualizado com sucesso.");
  });

  it("não espelha o PIN de edição no formulário de reset", async () => {
    const user = userEvent.setup();
    render(<SecurityForm />);
    const edit = screen.getByLabelText("Seu PIN de administrador", { selector: "#admin-pin-edit" });
    const reset = screen.getByLabelText("Seu PIN de administrador", { selector: "#admin-pin-verify" });
    await user.type(edit, "1234");
    expect(reset).toHaveValue("");
    await user.type(reset, "4321");
    expect(edit).toHaveValue("1234");
    expect(reset).toHaveValue("4321");
    expect(screen.queryByText("Perfil atualizado com sucesso.")).not.toBeInTheDocument();
  });
});
