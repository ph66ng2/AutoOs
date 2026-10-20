import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrimeiroAcessoWizard } from "./PrimeiroAcessoWizard";
import type { SecurityProfile, SensitiveAccessStatus } from "@/types";

const service = vi.hoisted(() => ({ redeemAccessCode: vi.fn(), savePersonalization: vi.fn() }));
vi.mock("@/lib/sensitive-access", () => ({ SensitiveAccessService: service }));

const pending: SecurityProfile = {
  id: 7,
  nome: "Recepção 2",
  role: "ATENDENTE",
  permissions: [],
  pin_configured: false,
  pin_required: true,
  is_default: false,
  ativo: true,
  onboarding_pendente: true,
};

function statusWith(profile: SecurityProfile): SensitiveAccessStatus {
  return {
    pin_configured: true,
    unlocked: true,
    active_profile_id: profile.id,
    active_profile_name: profile.nome,
    active_role: profile.role,
    permissions: profile.permissions,
    can_manage_profiles: false,
    profiles: [profile],
  };
}

describe("primeiro acesso", () => {
  beforeEach(() => vi.resetAllMocks());

  it("ativa com código e PIN, salva nome e visual e termina oferecendo o tour", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const onStatusChange = vi.fn();
    const activated = { ...pending, pin_configured: true, permissions: ["MANAGE_STATUS_LINKS" as const] };
    service.redeemAccessCode.mockResolvedValue(statusWith(activated));
    service.savePersonalization.mockResolvedValue(statusWith({ ...activated, nome: "Juliana", onboarding_pendente: false }));

    render(<PrimeiroAcessoWizard profile={pending} needsCode onStatusChange={onStatusChange} onCancel={vi.fn()} onFinish={onFinish} />);

    await user.type(screen.getByLabelText("Código de primeiro acesso"), "k7q42m");
    expect(screen.getByLabelText("Código de primeiro acesso")).toHaveValue("K7Q-42M");
    await user.type(screen.getByLabelText("Crie seu PIN"), "2468");
    await user.type(screen.getByLabelText("Repita o PIN"), "2460");
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(screen.getByRole("alert")).toHaveTextContent("Os PINs não conferem.");
    expect(service.redeemAccessCode).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Repita o PIN"));
    await user.type(screen.getByLabelText("Repita o PIN"), "2468");
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    await waitFor(() => expect(service.redeemAccessCode).toHaveBeenCalledWith(7, "K7Q-42M", "2468", "2468"));

    const nome = await screen.findByLabelText("Nome de exibição");
    await user.clear(nome);
    await user.type(nome, "Juliana");
    await user.click(screen.getByRole("button", { name: "Petróleo" }));
    await user.click(screen.getByRole("button", { name: "Escuro" }));
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    await waitFor(() => expect(service.savePersonalization).toHaveBeenCalledWith({
      nome: "Juliana",
      avatar_icone: expect.any(String),
      avatar_cor: "#0F766E",
      tema: "dark",
      concluir_onboarding: true,
    }));

    expect(await screen.findByRole("heading", { name: "Tudo pronto, Juliana" })).toBeInTheDocument();
    expect(screen.getByText("Portal do Cliente e links de acompanhamento")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Começar tour" }));
    expect(onFinish).toHaveBeenCalledWith("tour");
    expect(onStatusChange).toHaveBeenCalledTimes(2);
  });

  it("mostra o erro do código e permanece na etapa de acesso", async () => {
    const user = userEvent.setup();
    service.redeemAccessCode.mockRejectedValue("Código inválido ou expirado. Peça um novo código ao administrador.");
    render(<PrimeiroAcessoWizard profile={pending} needsCode onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);

    await user.type(screen.getByLabelText("Código de primeiro acesso"), "AAA222");
    await user.type(screen.getByLabelText("Crie seu PIN"), "1357");
    await user.type(screen.getByLabelText("Repita o PIN"), "1357");
    await user.click(screen.getByRole("button", { name: /Continuar/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Código inválido ou expirado");
    expect(screen.getByLabelText("Código de primeiro acesso")).toBeInTheDocument();
  });

  it("perfil já autenticado começa direto pelo nome e visual", () => {
    render(<PrimeiroAcessoWizard profile={{ ...pending, pin_configured: true }} needsCode={false} onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);
    expect(screen.getByLabelText("Nome de exibição")).toHaveValue("Recepção 2");
    expect(screen.queryByLabelText("Código de primeiro acesso")).not.toBeInTheDocument();
  });

  it("recuperação: só código e PIN novo, sem nome, visual nem tour", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const withPin = { ...pending, nome: "Ivan Santos", pin_configured: true, onboarding_pendente: false };
    service.redeemAccessCode.mockResolvedValue(statusWith(withPin));
    render(<PrimeiroAcessoWizard profile={withPin} needsCode recovery onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={onFinish} />);

    expect(screen.getByRole("heading", { name: "Redefinir o PIN de Ivan Santos" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Código de primeiro acesso"), "K7Q42M");
    await user.type(screen.getByLabelText("Crie seu PIN"), "1357");
    await user.type(screen.getByLabelText("Repita o PIN"), "1357");
    await user.click(screen.getByRole("button", { name: /Redefinir PIN/ }));

    await waitFor(() => expect(service.redeemAccessCode).toHaveBeenCalledWith(7, "K7Q-42M", "1357", "1357"));
    await waitFor(() => expect(onFinish).toHaveBeenCalledWith("ativado"));
    expect(service.savePersonalization).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nome de exibição")).not.toBeInTheDocument();
  });

  it("2º computador: perfil que já concluiu o primeiro acesso só informa código e PIN", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    const outroPc = { ...pending, nome: "Juliana", pin_configured: false, onboarding_pendente: false };
    service.redeemAccessCode.mockResolvedValue(statusWith({ ...outroPc, pin_configured: true }));
    render(<PrimeiroAcessoWizard profile={outroPc} needsCode onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={onFinish} />);

    expect(screen.getByRole("heading", { name: "Ativar Juliana neste computador" })).toBeInTheDocument();
    // Sem CSS no jsdom, o fluxo curto esconde a barra de etapas pela classe `hidden`.
    expect(screen.getByRole("list", { name: "Etapas", hidden: true })).toHaveClass("hidden");
    await user.type(screen.getByLabelText("Código de primeiro acesso"), "K7Q42M");
    await user.type(screen.getByLabelText("Crie seu PIN"), "2468");
    await user.type(screen.getByLabelText("Repita o PIN"), "2468");
    await user.click(screen.getByRole("button", { name: "Ativar neste computador" }));

    await waitFor(() => expect(onFinish).toHaveBeenCalledWith("ativado"));
    expect(service.savePersonalization).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Nome de exibição")).not.toBeInTheDocument();
  });

  it("recuperação avisa que o PIN antigo só deixa de valer neste computador", () => {
    render(<PrimeiroAcessoWizard profile={{ ...pending, pin_configured: true, onboarding_pendente: false }} needsCode recovery onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);
    expect(screen.getByText(/deixa de valer neste computador; nos outros, ele continua valendo/)).toBeInTheDocument();
  });
});
