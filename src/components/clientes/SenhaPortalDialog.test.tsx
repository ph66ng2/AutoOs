import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { gerarSenhaPortal, senhaPortalValida, SenhaPortalDialog } from "@/components/clientes/SenhaPortalDialog";
import type { ClienteContato } from "@/types";

const mocks = vi.hoisted(() => ({ definir: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { definirSenhaPortalContato: mocks.definir } }));

const contato: ClienteContato = {
  id: 5, empresa_id: 1, cliente_id: 2, nome: "Ana Souza", ativo: true, portal_acesso: "DECIDIR", portal_senha_definida_em: null,
};

describe("SenhaPortalDialog", () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(dados.textContent).toContain("CPF/CNPJ: 11.222.333/0001-81");
    expect(dados.textContent).toContain("Senha: Grafica-2026");
    expect(screen.getByText(/não será mostrada de novo/)).toBeInTheDocument();
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
});
