import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ obterOrcamentoInsumos: vi.fn(), marcarOrcamentoInsumosEntregue: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mocks }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: vi.fn().mockResolvedValue(true), hasPermission: () => true }),
}));

import { distribuirMudancas } from "@/lib/ao-vivo";
import { VendaRetirada } from "./VendaRetirada";

const venda = (status: string) => ({
  id: 7,
  status,
  numero_exibicao: "OI-7",
  cliente_nome: "Cliente Teste",
  atualizado_em: `t-${status}`,
  desconto: 0,
  valor_total: 10,
  itens: [{ id: 1, quantidade: 1, descricao: "Ribbon", valor_total: 10 }],
}) as never;

function renderizar() {
  return render(<VendaRetirada vendaId={7} onVoltar={() => {}} onInicio={() => {}} onTrocarPerfil={() => {}} />);
}

describe("VendaRetirada ao vivo", () => {
  beforeEach(() => {
    mocks.obterOrcamentoInsumos.mockReset();
    mocks.marcarOrcamentoInsumosEntregue.mockReset();
  });

  it.each([
    ["CANCELADO", "Esta venda foi cancelada e não pode mais ser entregue."],
    ["ENTREGUE", "Esta venda já foi entregue."],
  ])("venda %s em outro computador some com Registrar entrega sem esqueleto", async (status, aviso) => {
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda("APROVADO")).mockResolvedValueOnce(venda(status));
    renderizar();
    expect(await screen.findByRole("button", { name: /Registrar entrega/ })).toBeInTheDocument();

    act(() => distribuirMudancas([{ tabela: "orcamentos_insumos", id: 7, referencia: null, operacao: "U" }]));
    expect(screen.queryByText("Carregando venda...")).not.toBeInTheDocument();
    expect(await screen.findByText(aviso)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Registrar entrega/ })).not.toBeInTheDocument();
    expect(mocks.obterOrcamentoInsumos).toHaveBeenLastCalledWith(7, true);
  });

  it("fecha a confirmação aberta quando a venda deixa de estar aprovada", async () => {
    mocks.obterOrcamentoInsumos.mockResolvedValueOnce(venda("APROVADO")).mockResolvedValueOnce(venda("CANCELADO"));
    renderizar();
    fireEvent.click(await screen.findByRole("button", { name: /Registrar entrega/ }));
    expect(await screen.findByRole("button", { name: "Confirmar entrega" })).toBeInTheDocument();

    act(() => distribuirMudancas([{ tabela: "orcamentos_insumos", id: 7, referencia: null, operacao: "U" }]));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Confirmar entrega" })).not.toBeInTheDocument());
    expect(mocks.marcarOrcamentoInsumosEntregue).not.toHaveBeenCalled();
  });
});
