import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Tabs } from "@/components/ui/tabs";
import { ConfiguracoesTabSeguranca, type ConfiguracoesTabSegurancaProps } from "../ConfiguracoesTabSeguranca";
vi.mock("@/components/ProfileDeleteDialog", () => ({ ProfileDeleteDialog: () => null }));

const ivan = { id: 2, nome: "Ivan", role: "TECNICO", permissions: [], pin_configured: true, pin_required: true, ativo: true, is_default: false };
const ana = { id: 3, nome: "Ana", role: "ATENDENTE", permissions: [], pin_configured: false, pin_required: true, ativo: true, is_default: false };
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
  profilesCatalog: [ivan, ana],
  managedProfile: ivan,
  securityMessage: null,
  inactivityLockEnabled: false,
  onToggleInactivityLock: vi.fn(),
  deleteDialogOpen: false,
  onDeleteDialogOpenChange: vi.fn(),
  onDeleteSuccess: vi.fn(),
};

function renderTab(props: Partial<ConfiguracoesTabSegurancaProps> = {}) {
  return render(<MemoryRouter><Tabs defaultValue="seguranca"><ConfiguracoesTabSeguranca {...baseProps} {...props} /></Tabs></MemoryRouter>);
}
function SecurityForm({ initialMessage = "Perfil excluído permanentemente.", variant = "success" }: { initialMessage?: string; variant?: "success" | "error" }) {
  const [message, setMessage] = useState<string | null>(initialMessage);
  return <MemoryRouter><Tabs defaultValue="seguranca"><ConfiguracoesTabSeguranca {...baseProps} securityMessage={message} securityMessageVariant={variant} onClearSecurityMessage={() => setMessage(null)} /></Tabs></MemoryRouter>;
}

describe("painel de Segurança", () => {
  it("destaca erro com papel de alerta e sucesso com papel de status", () => {
    const { unmount } = render(<SecurityForm initialMessage="PIN do administrador inválido" variant="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent("PIN do administrador inválido");
    unmount();
    render(<SecurityForm />);
    expect(screen.getByRole("status")).toHaveTextContent("Perfil excluído permanentemente.");
  });

  it("não duplica a gestão de perfis: resume a equipe e aponta para Equipe e acessos", () => {
    renderTab();
    expect(screen.getByRole("link", { name: "Abrir Equipe e acessos" })).toHaveAttribute("href", "/perfil");
    expect(screen.getByText("2 pessoas ativas")).toBeInTheDocument();
    expect(screen.getByText(/1 com PIN configurado neste PC, 1 com PIN não configurado neste PC/)).toBeInTheDocument();
    expect(screen.getByText(/Recepção, Técnico, Financeiro/)).toBeInTheDocument();
    for (const name of [/Salvar perfil/, /Redefinir PIN/, /Desativar perfil/, /Reativar perfil/]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/modo leitura/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/PIN pendente|PIN ativo/)).not.toBeInTheDocument();
  });

  it("mantém o que só existe aqui: bloqueio por inatividade e exclusão com verificação dupla", async () => {
    const user = userEvent.setup();
    const onDeleteDialogOpenChange = vi.fn();
    renderTab({ onDeleteDialogOpenChange });
    expect(screen.getByRole("checkbox", { name: /bloqueio por inatividade/i })).toBeEnabled();
    expect(screen.getByText(/verificação dupla/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Excluir perfil permanentemente" }));
    expect(onDeleteDialogOpenChange).toHaveBeenCalledWith(true);
  });

  it("bloqueia a exclusão até liberar com o PIN de administrador", async () => {
    const user = userEvent.setup();
    const handleSecurityAdminToggle = vi.fn();
    renderTab({ securityAdminUnlocked: false, handleSecurityAdminToggle });
    expect(screen.getByRole("button", { name: "Excluir perfil permanentemente" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: /Liberar exclusão de perfis/ }));
    expect(handleSecurityAdminToggle).toHaveBeenCalledWith(true);
  });

  it("não mostra a administração para quem não gerencia perfis", () => {
    renderTab({ canManageProfiles: false });
    expect(screen.queryByRole("link", { name: "Abrir Equipe e acessos" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trocar meu PIN" })).toBeInTheDocument();
  });
});
