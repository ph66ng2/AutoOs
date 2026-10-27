import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Clientes from "@/pages/Clientes";

const mocks = vi.hoisted(() => ({
  criar: vi.fn(),
  atualizar: vi.fn(),
  clientes: [] as unknown[],
}));

vi.mock("@/hooks/useClientes", () => ({
  useClientes: () => ({
    clientes: mocks.clientes, total: mocks.clientes.length, loading: false, error: null,
    criar: mocks.criar, atualizar: mocks.atualizar, deletar: vi.fn(), recarregar: vi.fn(),
  }),
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ ensureSensitiveAccess: vi.fn() }) }));
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ error: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}));
vi.mock("@/lib/db", () => ({ db: { listarEquipamentosCliente: vi.fn().mockResolvedValue([]) } }));

const CPF = "529.982.247-25";

function clienteSalvo(extra: Record<string, unknown> = {}) {
  return {
    id: 7, tipo_pessoa: "PF", nome: "Ana Souza", documento: "52998224725", cpf_cnpj: "52998224725",
    telefone: "71999990000", receber_email: false, receber_whatsapp: false,
    exige_ordem_compra: false, atualizado_em: "2026-10-01 10:00:00", ativo: true, ...extra,
  };
}

function renderPagina() {
  return render(<MemoryRouter><Clientes /></MemoryRouter>);
}

describe("Clientes: ordem de compra e preferências", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.clientes = [];
    mocks.criar.mockResolvedValue({ sucesso: true });
    mocks.atualizar.mockResolvedValue({ sucesso: true });
  });

  it("mostra o selo Exige OC só para quem exige", () => {
    mocks.clientes = [clienteSalvo({ exige_ordem_compra: true }), clienteSalvo({ id: 8, nome: "Bruno Lima" })];
    renderPagina();
    expect(screen.getAllByText("Exige OC")).toHaveLength(1);
  });

  it("cria cliente com o checkbox marcado e preferências true por padrão", async () => {
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: /novo cliente/i }));
    fireEvent.change(await screen.findByLabelText(/CPF ou CNPJ/i), { target: { value: CPF } });
    fireEvent.change(await screen.findByPlaceholderText("Nome completo do cliente"), { target: { value: "Carla Dias" } });
    const check = screen.getByLabelText(/exige ordem de compra para aprovar orçamentos/i);
    expect(check).not.toBeChecked();
    fireEvent.click(check);
    fireEvent.click(screen.getByRole("button", { name: /^(salvar|criar|cadastrar)/i }));
    await waitFor(() => expect(mocks.criar).toHaveBeenCalled());
    expect(mocks.criar.mock.calls[0]![0]).toMatchObject({
      exige_ordem_compra: true, receber_email: true, receber_whatsapp: true,
    });
  });

  it("na edição preserva receber_email/receber_whatsapp salvos e envia a opção de OC", async () => {
    mocks.clientes = [clienteSalvo({ exige_ordem_compra: true })];
    renderPagina();
    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    const check = await screen.findByLabelText(/exige ordem de compra para aprovar orçamentos/i);
    expect(check).toBeChecked();
    fireEvent.click(check);
    fireEvent.click(screen.getByRole("button", { name: /^(salvar|atualizar)/i }));
    await waitFor(() => expect(mocks.atualizar).toHaveBeenCalled());
    expect(mocks.atualizar.mock.calls[0]![0]).toBe(7);
    expect(mocks.atualizar.mock.calls[0]![1]).toMatchObject({
      exige_ordem_compra: false, receber_email: false, receber_whatsapp: false,
    });
  });
});
