import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PublicStatusLinkDialog } from "@/components/equipamentos/PublicStatusLinkDialog";
import type { Equipamento } from "@/types";

const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  obter: vi.fn(),
  criar: vi.fn(),
  qr: vi.fn(),
  enviarEmail: vi.fn(),
  enviarWhatsApp: vi.fn(),
  whatsappDisponivel: true,
}));

vi.mock("@/lib/whatsapp-automatico", () => ({
  get WHATSAPP_AUTOMATICO_DISPONIVEL() {
    return mocks.whatsappDisponivel;
  },
}));

vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensure }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    obterLinkStatusPublico: mocks.obter,
    criarLinkStatusPublico: mocks.criar,
    gerarQrLinkStatusPublico: mocks.qr,
  },
}));
vi.mock("@/lib/email-service", () => ({
  EmailService: { enviarLinkStatusPublico: mocks.enviarEmail },
}));
vi.mock("@/lib/whatsapp-service", () => ({
  WhatsAppService: { enviarLinkStatusPublico: mocks.enviarWhatsApp },
}));

const equipamento = {
  id: 7,
  marca: "HP",
  modelo: "M404",
  cliente_nome: "Cliente Teste",
  cliente_email: "cliente@test.local",
  cliente_telefone: "71999999999",
} as Equipamento;

describe("PublicStatusLinkDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.whatsappDisponivel = true;
    mocks.obter.mockResolvedValue(null);
    mocks.criar.mockResolvedValue({ url: "https://status.test/link", expiresAt: null });
    mocks.qr.mockResolvedValue("<svg></svg>");
    mocks.enviarEmail.mockResolvedValue({ sucesso: true });
    mocks.enviarWhatsApp.mockResolvedValue({ sucesso: true });
    mocks.ensure.mockImplementation(async ({ permission }: { permission?: string }) =>
      permission !== "CONFIG_SMTP" && permission !== "CONFIG_WHATSAPP",
    );
  });

  it("envia o link por email e WhatsApp com PIN, sem permissão para configurar os canais", async () => {
    render(<PublicStatusLinkDialog equipamento={equipamento} open onOpenChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Criar link de acompanhamento" }));
    await waitFor(() => expect(mocks.criar).toHaveBeenCalledWith(7));

    fireEvent.click(await screen.findByRole("button", { name: "Enviar por email" }));
    await waitFor(() => expect(mocks.enviarEmail).toHaveBeenCalledWith(equipamento, "https://status.test/link"));

    fireEvent.click(screen.getByRole("button", { name: "Enviar por WhatsApp" }));
    await waitFor(() => expect(mocks.enviarWhatsApp).toHaveBeenCalledWith(equipamento, "https://status.test/link"));

    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ permission: "MANAGE_STATUS_LINKS" }));
    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ title: "Enviar acompanhamento por email" }));
    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ title: "Enviar acompanhamento por WhatsApp" }));
  });

  it("com o WhatsApp automático indisponível, o botão fica desativado e o aviso aparece", async () => {
    mocks.whatsappDisponivel = false;
    render(<PublicStatusLinkDialog equipamento={equipamento} open onOpenChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Criar link de acompanhamento" }));
    await waitFor(() => expect(mocks.criar).toHaveBeenCalledWith(7));

    const botao = await screen.findByRole("button", { name: "Enviar por WhatsApp" });
    expect(botao).toBeDisabled();
    expect(screen.getByText(/envio automático por WhatsApp ainda não está disponível/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar por email" })).toBeEnabled();
  });
});
