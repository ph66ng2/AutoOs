import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
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

  it("um segundo envio antes do primeiro terminar não dispara outra ativação", async () => {
    const user = userEvent.setup();
    let finish: (status: SensitiveAccessStatus) => void = () => undefined;
    service.redeemAccessCode.mockReturnValue(new Promise<SensitiveAccessStatus>((resolve) => { finish = resolve; }));
    render(<PrimeiroAcessoWizard profile={pending} needsCode onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);

    await user.type(screen.getByLabelText("Código de primeiro acesso"), "K7Q42M");
    await user.type(screen.getByLabelText("Crie seu PIN"), "2468");
    await user.type(screen.getByLabelText("Repita o PIN"), "2468");
    const continuar = screen.getByRole("button", { name: /Continuar/ });
    // Dois cliques no mesmo tick, antes de o React desabilitar o botão.
    act(() => {
      continuar.click();
      continuar.click();
    });
    expect(service.redeemAccessCode).toHaveBeenCalledTimes(1);

    await act(async () => finish(statusWith({ ...pending, pin_configured: true })));
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

  it("marca a tela cheia como bloqueio para o tour não abrir por cima dela", () => {
    render(<PrimeiroAcessoWizard profile={pending} needsCode onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-blocks-tour", "true");
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

  async function preencherCodigoEPin(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Código de primeiro acesso"), "K7Q42M");
    await user.type(screen.getByLabelText("Crie seu PIN"), "2468");
    await user.type(screen.getByLabelText("Repita o PIN"), "2468");
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
  }

  it("voltar depois do código mostra a etapa já resgatada sem pedir o código de novo", async () => {
    const user = userEvent.setup();
    service.redeemAccessCode.mockResolvedValue(statusWith({ ...pending, pin_configured: true }));
    render(<PrimeiroAcessoWizard profile={pending} needsCode onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);

    await preencherCodigoEPin(user);
    expect(await screen.findByLabelText("Nome de exibição")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(await screen.findByRole("heading", { name: "Código e PIN definidos" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Código de primeiro acesso")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(await screen.findByLabelText("Nome de exibição")).toBeInTheDocument();
    expect(service.redeemAccessCode).toHaveBeenCalledTimes(1);
  });

  it("voltar de pronto mantém o nome e salvar de novo chama a personalização outra vez", async () => {
    const user = userEvent.setup();
    const activated = { ...pending, pin_configured: true };
    service.redeemAccessCode.mockResolvedValue(statusWith(activated));
    service.savePersonalization.mockResolvedValue(statusWith({ ...activated, nome: "Juliana", onboarding_pendente: false }));
    render(<PrimeiroAcessoWizard profile={pending} needsCode onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);

    await preencherCodigoEPin(user);
    const nome = await screen.findByLabelText("Nome de exibição");
    await user.clear(nome);
    await user.type(nome, "Juliana");
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(await screen.findByRole("heading", { name: "Tudo pronto, Juliana" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByLabelText("Nome de exibição")).toHaveValue("Juliana");
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(await screen.findByRole("heading", { name: "Tudo pronto, Juliana" })).toBeInTheDocument();
    expect(service.savePersonalization).toHaveBeenCalledTimes(2);
  });

  it("rerender com onboarding concluído em pronto mantém a lista de etapas visível", async () => {
    const user = userEvent.setup();
    const activated = { ...pending, pin_configured: true };
    service.redeemAccessCode.mockResolvedValue(statusWith(activated));
    service.savePersonalization.mockResolvedValue(statusWith({ ...activated, nome: "Juliana", onboarding_pendente: false }));
    const onStatusChange = vi.fn();
    const onCancel = vi.fn();
    const onFinish = vi.fn();
    const ui = (perfil: SecurityProfile) => (
      <PrimeiroAcessoWizard profile={perfil} needsCode onStatusChange={onStatusChange} onCancel={onCancel} onFinish={onFinish} />
    );
    const { rerender } = render(ui(pending));

    await preencherCodigoEPin(user);
    const nome = await screen.findByLabelText("Nome de exibição");
    await user.clear(nome);
    await user.type(nome, "Juliana");
    await user.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(await screen.findByRole("heading", { name: "Tudo pronto, Juliana" })).toBeInTheDocument();

    rerender(ui({ ...activated, nome: "Juliana", onboarding_pendente: false }));
    const etapas = screen.getByRole("list", { name: "Etapas" });
    expect(etapas).toBeInTheDocument();
    expect(etapas).not.toHaveClass("hidden");
    expect(screen.getByRole("heading", { name: "Tudo pronto, Juliana" })).toBeInTheDocument();
  });

  it("sem código, a etapa de perfil não tem botão Voltar", () => {
    render(<PrimeiroAcessoWizard profile={pending} needsCode={false} onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Deixe com a sua cara" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voltar" })).not.toBeInTheDocument();
  });

  it("a raiz começa claro e passa a escuro ao escolher o tema Escuro", async () => {
    const user = userEvent.setup();
    render(<PrimeiroAcessoWizard profile={pending} needsCode={false} onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);
    const raiz = screen.getByRole("dialog");
    expect(raiz).toHaveClass("light");

    await user.click(screen.getByRole("button", { name: "Escuro" }));
    expect(raiz).toHaveClass("dark");
    expect(raiz).not.toHaveClass("light");
  });

  it("o botão Continuar fica fora do conteúdo rolável", () => {
    render(<PrimeiroAcessoWizard profile={pending} needsCode={false} onStatusChange={vi.fn()} onCancel={vi.fn()} onFinish={vi.fn()} />);
    expect(screen.getByRole("button", { name: /continuar/i }).closest('[data-slot="wizard-scroll"]')).toBeNull();
  });
});
