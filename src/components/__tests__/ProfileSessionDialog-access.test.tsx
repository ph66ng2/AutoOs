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
  it("não chama de PIN não configurado um perfil explicitamente sem exigência de PIN", () => {
    const optional = { ...admin, id: 2, nome: "Operador", role: "CUSTOM", pin_required: false, is_default: false };
    render(<ProfileSessionDialog {...defaults} mode="selector" profiles={[optional]} selectedProfileId="2" selectedProfile={optional} activeProfileId={1} />);
    expect(screen.queryByText("PIN não configurado neste PC", { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByText("Não exige PIN", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Este perfil não exige PIN. Clique abaixo para continuar.").length).toBeGreaterThan(0);
  });

  it("bloqueia PIN exigido mas ausente neste PC, inclusive administrador", () => {
    const protectedAdmin = { ...admin, pin_required: true };
    render(<ProfileSessionDialog {...defaults} profiles={[protectedAdmin]} selectedProfile={protectedAdmin} />);
    expect(screen.getByRole("button", { name: "PIN não configurado neste PC" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Criar meu acesso/ })).not.toBeInTheDocument();
  });

  it("reflete o valor real de pin_required nos textos do perfil", () => {
    const required = { ...admin, id: 3, nome: "Caixa", role: "CUSTOM", pin_required: true, pin_configured: true, is_default: false };
    const unknown = { ...admin, id: 4, nome: "Antigo", role: "CUSTOM", pin_required: undefined, pin_configured: false, is_default: false };
    const { rerender } = render(<ProfileSessionDialog {...defaults} mode="selector" profiles={[required]} selectedProfileId="3" selectedProfile={required} activeProfileId={1} />);
    expect(screen.getAllByText("PIN configurado neste PC").length).toBeGreaterThan(0);
    expect(screen.queryByText("Não exige PIN")).not.toBeInTheDocument();
    rerender(<ProfileSessionDialog {...defaults} mode="selector" profiles={[unknown]} selectedProfileId="4" selectedProfile={unknown} activeProfileId={1} />);
    expect(screen.queryByText(/não exige PIN/i)).not.toBeInTheDocument();
    expect(screen.getAllByText("PIN não configurado neste PC").length).toBeGreaterThan(0);
  });

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
