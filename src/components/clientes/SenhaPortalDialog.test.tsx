import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { gerarSenhaPortal, linkWhatsappAcesso, mensagemAcessoPortal, PORTAL_URL, senhaPortalValida, SenhaPortalDialog } from "@/components/clientes/SenhaPortalDialog";
import type { ClienteContato } from "@/types";

const ensure = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ ensureSensitiveAccess: ensure }) }));

const mocks = vi.hoisted(() => ({ definir: vi.fn(), abrirUrl: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { definirSenhaPortalContato: mocks.definir, abrirUrl: mocks.abrirUrl } }));

const contato: ClienteContato = {
  id: 5, empresa_id: 1, cliente_id: 2, nome: "Ana Souza", ativo: true, portal_acesso: "DECIDIR", portal_senha_definida_em: null,
};

describe("SenhaPortalDialog", () => {
  beforeEach(() => { vi.clearAllMocks(); ensure.mockResolvedValue(true); });

  it("gera senhas fortes que passam na regra do banco", () => {
    for (let i = 0; i < 50; i += 1) {
      const senha = gerarSenhaPortal();
      expect(senha).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
      expect(senhaPortalValida(senha)).toBe(true);
    }
    expect(senhaPortalValida("curta1")).toBe(false);
    expect(senhaPortalValida("semnumeros")).toBe(false);
  });

  it("operador cria a senha e vê os dados de acesso uma única vez", async () => {
    mocks.definir.mockResolvedValue({ ...contato, portal_senha_definida_em: "2026-10-16T10:00:00Z" });
    const onSalvo = vi.fn();
    render(<SenhaPortalDialog contato={contato} documentoCliente="11.222.333/0001-81" onClose={vi.fn()} onSalvo={onSalvo} />);
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Grafica-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar senha" }));
    await waitFor(() => expect(mocks.definir).toHaveBeenCalledWith(5, "Grafica-2026"));
    expect(onSalvo).toHaveBeenCalled();
    const dados = screen.getByLabelText("Dados de acesso");
    expect(dados.textContent).toContain("Seu CPF/CNPJ:\n11222333000181\n");
    expect(dados.textContent).toContain("Sua senha:\nGrafica-2026\n");
    expect(dados.textContent).toContain("Para trocá-la, fale com a equipe");
    expect(screen.getByText(/não será mostrada de novo/)).toBeInTheDocument();
  });

  it("senha de quem só acompanha pede Acessos do portal; de quem decide, Orçamentos ou financeiro", async () => {
    mocks.definir.mockResolvedValue({ ...contato, portal_senha_definida_em: "2026-10-16T10:00:00Z" });
    const { unmount } = render(<SenhaPortalDialog contato={{ ...contato, portal_acesso: "ACOMPANHAR" }} documentoCliente="11.222.333/0001-81" onClose={vi.fn()} onSalvo={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar senha" }));
    await waitFor(() => expect(ensure).toHaveBeenCalledWith(expect.objectContaining({ permission: "MANAGE_STATUS_LINKS" })));
    unmount();
    ensure.mockClear();
    render(<SenhaPortalDialog contato={{ ...contato, portal_acesso: "DECIDIR" }} documentoCliente="11.222.333/0001-81" onClose={vi.fn()} onSalvo={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar senha" }));
    await waitFor(() => expect(ensure).toHaveBeenCalledWith(expect.objectContaining({ anyPermission: ["FINANCIAL_ACTIONS", "PREPARE_QUOTES"] })));
  });

  it("PIN negado não chama o backend nem mostra erro cru", async () => {
    ensure.mockResolvedValue(false);
    render(<SenhaPortalDialog contato={contato} documentoCliente="11.222.333/0001-81" onClose={vi.fn()} onSalvo={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar senha" }));
    await waitFor(() => expect(ensure).toHaveBeenCalled());
    expect(mocks.definir).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("recusa senha fraca sem chamar o backend", async () => {
    render(<SenhaPortalDialog contato={contato} documentoCliente="11.222.333/0001-81" onClose={vi.fn()} onSalvo={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("8 a 72 caracteres");
    expect(mocks.definir).not.toHaveBeenCalled();
  });

  it("mostra o erro do backend (senha repetida em outro contato)", async () => {
    mocks.definir.mockRejectedValue(new Error("Outro contato deste CPF/CNPJ já usa essa senha."));
    render(<SenhaPortalDialog contato={contato} documentoCliente="11.222.333/0001-81" onClose={vi.fn()} onSalvo={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar senha" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("já usa essa senha");
  });

  it("envia os dados de acesso pelo WhatsApp do contato (link wa.me, sem passar pelo servidor)", async () => {
    mocks.definir.mockResolvedValue({ ...contato, portal_senha_definida_em: "2026-10-16T10:00:00Z" });
    mocks.abrirUrl.mockResolvedValue(undefined);
    render(<SenhaPortalDialog contato={{ ...contato, telefone: "71988887777" }} documentoCliente="11.222.333/0001-81" onClose={vi.fn()} onSalvo={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Grafica-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar senha" }));
    fireEvent.click(await screen.findByRole("button", { name: /Enviar por WhatsApp/ }));
    await waitFor(() => expect(mocks.abrirUrl).toHaveBeenCalled());
    const url = mocks.abrirUrl.mock.calls[0][0] as string;
    expect(url.startsWith("https://wa.me/5571988887777?text=")).toBe(true);
    const texto = decodeURIComponent(url.split("text=")[1]);
    expect(texto).toBe(mensagemAcessoPortal("Ana Souza", "11.222.333/0001-81", "Grafica-2026"));
    expect(texto).toContain("Sua senha:\nGrafica-2026\n");
  });

  it("mensagem de acesso: cada dado sozinho na linha, sem negrito, documento só com dígitos", () => {
    expect(mensagemAcessoPortal("Maria", "123.456.789-09", "Kp7m-Tx4q-9Wbd")).toBe(
      [
        "Olá, Maria! Seu acesso ao Portal das Impressoras BMI TAG.",
        "",
        "Link do portal:",
        PORTAL_URL,
        "",
        "Seu CPF/CNPJ:",
        "12345678909",
        "",
        "Sua senha:",
        "Kp7m-Tx4q-9Wbd",
        "",
        "A senha é pessoal. Para trocá-la, fale com a equipe BMI TAG.",
      ].join("\n"),
    );
    expect(mensagemAcessoPortal("Maria", "11.222.333/0001-81", "x")).not.toContain("*");
  });

  it("sem telefone não oferece WhatsApp; número com DDI não ganha 55 de novo", () => {
    expect(linkWhatsappAcesso("123", "x")).toBeNull();
    expect(linkWhatsappAcesso("+55 71 98888-7777", "x")).toBe("https://wa.me/5571988887777?text=x");
  });
});
