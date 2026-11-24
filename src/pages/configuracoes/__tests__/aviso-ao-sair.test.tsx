import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, Link, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  smtpBuscar: vi.fn(),
  whatsappBuscar: vi.fn(),
  fotosBuscar: vi.fn(),
  obterConfigSuporte: vi.fn(),
}));

vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({
    status: { unlocked: true, pin_configured: true, active_profile_id: 1, profiles: [] },
    refreshStatus: vi.fn(),
    hasPermission: (permissao: string) => permissao === "COMMUNICATION_SETTINGS",
    ensureSensitiveAccess: vi.fn(async () => true),
    connectionUnavailable: false,
  }),
}));
vi.mock("@/lib/smtp-config", () => ({ SmtpConfigService: { buscar: m.smtpBuscar, salvar: vi.fn() } }));
vi.mock("@/lib/whatsapp-config", () => ({ WhatsappConfigService: { buscar: m.whatsappBuscar, salvar: vi.fn() } }));
vi.mock("@/lib/photo-tunnel-config", () => ({ PhotoTunnelConfigService: { buscar: m.fotosBuscar, salvar: vi.fn() } }));
vi.mock("@/lib/sensitive-access", () => ({ SensitiveAccessService: { listAuditEvents: vi.fn(async () => []), listProfiles: vi.fn(async () => []) } }));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, {
    get: (_alvo, nome) => (nome === "obterConfigSuporte" ? m.obterConfigSuporte : vi.fn(async () => null)),
  }),
}));
vi.mock("@/pages/configuracoes/ConfiguracoesTabGeral", async () => {
  const { TabsContent } = await import("@/components/ui/tabs");
  return { ConfiguracoesTabGeral: () => <TabsContent value="geral">Preferências deste computador</TabsContent> };
});
vi.mock("@/pages/configuracoes/ConfiguracoesTabPortal", async () => {
  const { TabsContent } = await import("@/components/ui/tabs");
  return { ConfiguracoesTabPortal: () => <TabsContent value="portal">Conteúdo do portal</TabsContent> };
});
vi.mock("@/components/configuracoes/MensagensProntasCard", () => ({ MensagensProntasCard: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Configuracoes from "@/pages/Configuracoes";

function montar() {
  const router = createMemoryRouter(
    [
      { path: "/configuracoes", element: <><Link to="/outra">Menu: outra tela</Link><Configuracoes /></> },
      { path: "/outra", element: <p>Outra tela</p> },
    ],
    { initialEntries: ["/configuracoes"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

async function abrirIntegracoes(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("tab", { name: "Integrações" }));
  return screen.findByLabelText("ID do canal");
}

describe("Configurações: sair com texto não salvo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.smtpBuscar.mockResolvedValue({ host: "smtp.empresa.com", port: 465, username: "u", from_name: "Empresa", from_email: "os@empresa.com", use_tls: true, has_password: true });
    m.whatsappBuscar.mockResolvedValue({ provider: "EVOLUTION", api_url: "https://wa.empresa.com/send", has_token: true });
    m.fotosBuscar.mockResolvedValue({ has_token: false, env_override: false, public_host: "fotos.empresa.com" });
    m.obterConfigSuporte.mockResolvedValue({ canal: "C123", token_neste_computador: true, token_da_instalacao: false });
  });

  it("sem alteração, trocar de aba e sair pelo menu não perguntam", async () => {
    const user = userEvent.setup();
    const router = montar();
    const canal = await abrirIntegracoes(user);
    await waitFor(() => expect(canal).toHaveValue("C123"));
    await user.click(screen.getByRole("tab", { name: "Portal do Cliente" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Conteúdo do portal")).toBeInTheDocument();
    await user.click(screen.getByText("Menu: outra tela"));
    expect(router.state.location.pathname).toBe("/outra");
  });

  it("cartão com Salvar próprio alterado: menu e troca de aba perguntam; sair descarta", async () => {
    const user = userEvent.setup();
    const router = montar();
    const canal = await abrirIntegracoes(user);
    await waitFor(() => expect(canal).toHaveValue("C123"));
    await user.type(canal, "9");

    await user.click(screen.getByText("Menu: outra tela"));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(router.state.location.pathname).toBe("/configuracoes");
    expect(screen.getByLabelText("ID do canal")).toHaveValue("C1239");

    await user.click(screen.getByRole("tab", { name: "Portal do Cliente" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("ID do canal")).toHaveValue("C1239");

    await user.click(screen.getByRole("tab", { name: "Portal do Cliente" }));
    await user.click(await screen.findByRole("button", { name: "Sair sem salvar" }));
    expect(await screen.findByText("Conteúdo do portal")).toBeInTheDocument();
    // A aba descartou o cartão: sair pelo menu agora não pergunta.
    await user.click(screen.getByText("Menu: outra tela"));
    expect(router.state.location.pathname).toBe("/outra");
  });

  it("endereço do WhatsApp alterado: trocar de aba pergunta e, confirmado, volta ao salvo", async () => {
    const user = userEvent.setup();
    montar();
    await abrirIntegracoes(user);
    await user.click(screen.getAllByRole("button", { name: "Editar" })[1]!);
    const url = screen.getByLabelText("API URL");
    await user.clear(url);
    await user.type(url, "https://outro.exemplo/send");

    await user.click(screen.getByRole("tab", { name: "Geral" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(await screen.findByText("Preferências deste computador")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Integrações" }));
    expect(await screen.findByText("wa.empresa.com")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Geral" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
