import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EnvioManualOrcamentoDialog } from "@/components/equipamentos/EnvioManualOrcamentoDialog";
import type { DestinatarioOrcamento, EnvioManualOrcamento } from "@/types";

const mocks = vi.hoisted(() => ({ abrirUrl: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: { abrirUrl: mocks.abrirUrl },
}));

const destinatario: DestinatarioOrcamento = {
  contatoId: 1,
  nome: "Ana",
  telefone: "71988887777",
  email: "ana@cliente.com",
  clienteNome: "Cliente SA",
  clienteDocumento: "00000000000191",
  origem: "CONTATO",
  portalAcesso: "DECIDIR",
  temSenha: true,
  usouSenhaAtual: false,
  precisaContato: false,
};

function envio(overrides: Partial<EnvioManualOrcamento> = {}): EnvioManualOrcamento {
  return {
    destinatario,
    assunto: "Orçamento 123",
    texto: "Olá! Segue o orçamento.\nSenha do portal: ABC-123",
    temSenha: true,
    podeGerarNovaSenha: true,
    equipamentoId: 7,
    ...overrides,
  };
}

const writeText = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.abrirUrl.mockResolvedValue(undefined);
  writeText.mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("EnvioManualOrcamentoDialog", () => {
  it("monta os links de WhatsApp e e-mail com telefone, e-mail, assunto e texto", async () => {
    render(<EnvioManualOrcamentoDialog envio={envio()} onFechar={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp" }));
    await waitFor(() => expect(mocks.abrirUrl).toHaveBeenCalledTimes(1));
    const wa = mocks.abrirUrl.mock.calls[0][0] as string;
    expect(wa.startsWith("https://wa.me/5571988887777?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("?text=")[1])).toBe("Olá! Segue o orçamento.\nSenha do portal: ABC-123");

    fireEvent.click(screen.getByRole("button", { name: "Abrir e-mail" }));
    await waitFor(() => expect(mocks.abrirUrl).toHaveBeenCalledTimes(2));
    const mail = mocks.abrirUrl.mock.calls[1][0] as string;
    expect(mail.startsWith("mailto:ana@cliente.com?subject=")).toBe(true);
    expect(mail).toContain(encodeURIComponent("Orçamento 123"));
    expect(mail).toContain(encodeURIComponent("Olá! Segue o orçamento.\nSenha do portal: ABC-123"));
  });

  it("desabilita os botões de envio sem telefone ou e-mail válido", () => {
    render(
      <EnvioManualOrcamentoDialog
        envio={envio({ destinatario: { ...destinatario, telefone: null, email: "invalido" } })}
        onFechar={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Abrir WhatsApp" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Abrir e-mail" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copiar" })).toBeEnabled();
  });

  it("copia o texto para a área de transferência", async () => {
    render(<EnvioManualOrcamentoDialog envio={envio()} onFechar={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Olá! Segue o orçamento.\nSenha do portal: ABC-123"));
  });

  it("pede confirmação ao fechar sem ter usado nenhum botão com senha no texto", async () => {
    const onFechar = vi.fn();
    render(<EnvioManualOrcamentoDialog envio={envio()} onFechar={onFechar} />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(await screen.findByText("A senha não aparece de novo.")).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Fechar mesmo assim" }));
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it("confirmação com podeGerarNovaSenha oferece Voltar, Fechar mesmo assim e Gerar nova senha", async () => {
    const onFechar = vi.fn();
    const onGerarNovaSenha = vi.fn().mockResolvedValue(envio());
    render(<EnvioManualOrcamentoDialog envio={envio()} onFechar={onFechar} onGerarNovaSenha={onGerarNovaSenha} />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(await screen.findByText("A senha não aparece de novo.")).toBeInTheDocument();
    expect(screen.getByText("Copie ou envie antes de fechar, ou gere uma nova senha.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar mesmo assim" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gerar nova senha" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gerar nova senha" }));
    await waitFor(() => expect(onGerarNovaSenha).toHaveBeenCalledTimes(1));
    expect(onFechar).not.toHaveBeenCalled();
  });

  it("confirmação sem podeGerarNovaSenha oferece só Voltar e Fechar mesmo assim", async () => {
    const onFechar = vi.fn();
    render(<EnvioManualOrcamentoDialog envio={envio({ podeGerarNovaSenha: false })} onFechar={onFechar} />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(await screen.findByText("Copie ou envie antes de fechar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar mesmo assim" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gerar nova senha" })).not.toBeInTheDocument();
  });

  it("Voltar mantém o diálogo aberto e não fecha", async () => {
    const onFechar = vi.fn();
    render(<EnvioManualOrcamentoDialog envio={envio({ podeGerarNovaSenha: false })} onFechar={onFechar} />);

    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Voltar" }));

    await waitFor(() => expect(screen.queryByText("A senha não aparece de novo.")).not.toBeInTheDocument());
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
  });

  it("fecha direto depois de usar um botão de envio", async () => {
    const onFechar = vi.fn();
    render(<EnvioManualOrcamentoDialog envio={envio()} onFechar={onFechar} />);

    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(onFechar).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("A senha não aparece de novo.")).not.toBeInTheDocument();
  });

  it("gerar nova senha substitui o texto", async () => {
    const onGerarNovaSenha = vi.fn().mockResolvedValue(
      envio({ texto: "Olá! Segue o orçamento.\nSenha do portal: XYZ-999" }),
    );
    render(
      <EnvioManualOrcamentoDialog
        envio={envio({ texto: "Olá! Segue o orçamento.", temSenha: false })}
        onFechar={vi.fn()}
        onGerarNovaSenha={onGerarNovaSenha}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Gerar nova senha" }));

    await waitFor(() => expect(onGerarNovaSenha).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Texto do orçamento" }).value).toContain("XYZ-999"),
    );
  });

  it("mostra erro quando gerar nova senha falha", async () => {
    const onGerarNovaSenha = vi.fn().mockRejectedValue("Sem permissão.");
    render(
      <EnvioManualOrcamentoDialog
        envio={envio({ temSenha: false })}
        onFechar={vi.fn()}
        onGerarNovaSenha={onGerarNovaSenha}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Gerar nova senha" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sem permissão.");
  });
});
