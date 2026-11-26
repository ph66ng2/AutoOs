import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OrcamentoInsumos } from "@/types";

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
  listar: vi.fn(),
  ensureSensitiveAccess: vi.fn(),
  modalProps: vi.fn(),
  navigate: vi.fn(),
  sessao: null as null | { unlocked: boolean; active_profile_id: number },
}));

// A lista navega para a página do orçamento (/vendas/:id).
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/lib/db", () => ({ db: { listarOrcamentosInsumos: mocks.listar } }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensureSensitiveAccess, hasPermission: mocks.hasPermission, status: mocks.sessao }),
}));
// Cada ação abre o seu modal (AcaoVendaDialog, V.5).
vi.mock("@/components/vendas/AcaoVendaDialog", () => ({
  AcaoVendaDialog: (props: { acao: string | null; vendaId: number | null; onAlterado?: () => void }) => {
    mocks.modalProps(props);
    return props.acao ? (
      <div data-testid="modal-acao">
        {props.acao} {props.vendaId}
        <button onClick={props.onAlterado}>simular-acao</button>
      </div>
    ) : null;
  },
}));


import { OrcamentosInsumosTab } from "@/pages/insumos/OrcamentosInsumosTab";

function linha(numero: number, status: OrcamentoInsumos["status"], valor: number): OrcamentoInsumos {
  return {
    id: numero * 10,
    empresa_id: 1,
    numero,
    numero_exibicao: `OI-${numero}`,
    cliente_id: 3,
    cliente_nome: `Cliente ${numero}`,
    status,
    desconto: 0,
    valor_subtotal: valor,
    valor_total: valor,
    criado_em: "2026-10-20 14:03:05+00",
    atualizado_em: "2026-10-20 14:03:05+00",
    total_itens: numero,
  };
}

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sessao = null;
  mocks.ensureSensitiveAccess.mockResolvedValue(true);
  mocks.listar.mockResolvedValue({
    items: [linha(2, "APROVADO", 150), linha(1, "RASCUNHO", 20.5)],
    total: 2,
  });
});

describe("OrcamentosInsumosTab", () => {
  it("mostra selo Vencido só em orçamento em aberto com validade passada", async () => {
    mocks.listar.mockResolvedValue({
      items: [
        { ...linha(3, "ENVIADO", 90), validade: "2000-01-01" },
        { ...linha(2, "ENVIADO", 80), validade: "2099-12-31" },
        { ...linha(1, "APROVADO", 70), validade: "2000-01-01" },
      ],
      total: 3,
    });
    render(<OrcamentosInsumosTab />);
    const vencido = await screen.findByRole("row", { name: /abrir orçamento OI-3/i });
    expect(within(vencido).getByText("Vencido")).toBeInTheDocument();
    const valido = screen.getByRole("row", { name: /abrir orçamento OI-2/i });
    expect(within(valido).queryByText("Vencido")).not.toBeInTheDocument();
    const aprovado = screen.getByRole("row", { name: /abrir orçamento OI-1/i });
    expect(within(aprovado).queryByText("Vencido")).not.toBeInTheDocument();
  });

  it("lista número, cliente, data, valor e status com a cor do status", async () => {
    render(<OrcamentosInsumosTab />);
    const primeira = await screen.findByRole("row", { name: /abrir orçamento OI-2/i });
    expect(within(primeira).getByText("OI-2")).toBeInTheDocument();
    expect(within(primeira).getByText("Cliente 2")).toBeInTheDocument();
    expect(within(primeira).getByText("2 itens")).toBeInTheDocument();
    expect(within(primeira).getByText(/R\$\s*150,00/)).toBeInTheDocument();
    // A data de criação fica no título do número (a coluna "Prazo ou data" já mostra a data que importa).
    expect(within(primeira).getByText("OI-2")).toHaveAttribute("title", "Criado em 20/10/2026");
    expect(within(primeira).getByText("Aprovado")).toBeInTheDocument();
    // A cor do status fica na barra de etapas, como na lista de equipamentos.
    const barra = within(primeira).getByRole("img", { name: "Etapa 3 de 4" });
    expect(barra.firstElementChild?.className).toMatch(/bg-status-ok/);

    const segunda = screen.getByRole("row", { name: /abrir orçamento OI-1/i });
    expect(within(segunda).getByText("1 item")).toBeInTheDocument();
    expect(within(segunda).getByText("Rascunho")).toBeInTheDocument();
    expect(mocks.listar).toHaveBeenCalledWith({ busca: undefined, status: "TODOS", page: 0 });
  });

  it("busca por texto recarrega a lista com o filtro", async () => {
    render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    fireEvent.change(screen.getByLabelText("Buscar orçamento"), { target: { value: "OI-1" } });
    await waitFor(() => expect(mocks.listar).toHaveBeenLastCalledWith({ busca: "OI-1", status: "TODOS", page: 0 }));
  });

  it("filtra por status", async () => {
    const usuario = userEvent.setup();
    render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    await usuario.click(screen.getByRole("button", { name: /^Aprovado/ }));
    await waitFor(() => expect(mocks.listar).toHaveBeenLastCalledWith({ busca: undefined, status: "APROVADO", page: 0 }));
  });

  it("Minhas: só aparece para quem criou algum orçamento e filtra por quem criou", async () => {
    const usuario = userEvent.setup();
    const { unmount } = render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    expect(screen.queryByRole("button", { name: /^Minhas/ })).not.toBeInTheDocument();
    unmount();

    mocks.sessao = { unlocked: true, active_profile_id: 5 };
    render(<OrcamentosInsumosTab />);
    await usuario.click(await screen.findByRole("button", { name: /^Minhas/ }));
    await waitFor(() => expect(mocks.listar).toHaveBeenCalledWith({ busca: undefined, status: "TODOS", page: 0, criado_por_profile_id: 5 }));
  });

  it("clicar numa linha abre o orçamento", async () => {
    render(<OrcamentosInsumosTab />);
    fireEvent.click(await screen.findByRole("row", { name: /abrir orçamento OI-1/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/vendas/10");
  });

  it("novo orçamento pede PIN financeiro antes de abrir em branco", async () => {
    render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    fireEvent.click(screen.getByRole("button", { name: /novo orçamento/i }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/vendas/novo"));
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));
  });

  it("PIN recusado não abre o formulário", async () => {
    mocks.ensureSensitiveAccess.mockResolvedValue(false);
    render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    fireEvent.click(screen.getByRole("button", { name: /novo orçamento/i }));
    await waitFor(() => expect(mocks.ensureSensitiveAccess).toHaveBeenCalled());
    expect(mocks.navigate).not.toHaveBeenCalledWith("/vendas/novo");
    expect(mocks.navigate).not.toHaveBeenCalledWith("/vendas/novo");
  });

  it("estado vazio e erro de carga", async () => {
    mocks.listar.mockResolvedValueOnce({ items: [], total: 0 });
    const { unmount } = render(<OrcamentosInsumosTab />);
    expect(await screen.findByText("Nenhuma venda de insumos ainda")).toBeInTheDocument();
    unmount();

    mocks.listar.mockRejectedValueOnce("Falha ao consultar o banco");
    render(<OrcamentosInsumosTab />);
    expect(await screen.findByText(/Falha ao consultar o banco/)).toBeInTheDocument();
  });

  it("avisa a página quando uma ação do orçamento muda o estoque", async () => {
    const aoAlterarEstoque = vi.fn();
    render(<OrcamentosInsumosTab onEstoqueAlterado={aoAlterarEstoque} />);
    await screen.findByText("OI-2");
    await userEvent.click(screen.getByRole("button", { name: "Marcar entregue" }));
    await userEvent.click(await screen.findByText("simular-acao"));
    expect(aoAlterarEstoque).toHaveBeenCalledTimes(1);
  });
});

describe("Vendas de insumos: ação principal, prazo e permissão (fase V.2)", () => {
  beforeEach(() => {
    mocks.hasPermission.mockReturnValue(true);
  });

  function comValidade(numero: number, status: OrcamentoInsumos["status"], validade: string): OrcamentoInsumos {
    return { ...linha(numero, status, 100), validade };
  }

  it("Enviado mostra Aprovar e a ação abre o modal; vencido vira Renovar validade", async () => {
    mocks.listar.mockResolvedValue({
      items: [comValidade(5, "ENVIADO", "2999-12-31"), comValidade(4, "ENVIADO", "2020-01-01")],
      total: 2,
    });
    const usuario = userEvent.setup();
    render(<OrcamentosInsumosTab />);
    const emDia = await screen.findByRole("row", { name: /abrir orçamento OI-5/i });
    expect(within(emDia).getByText("vence 31/12")).toBeInTheDocument();
    const vencido = screen.getByRole("row", { name: /abrir orçamento OI-4/i });
    expect(within(vencido).getByText("venceu 01/01")).toBeInTheDocument();
    expect(within(vencido).getByRole("button", { name: "Renovar validade" })).toBeInTheDocument();
    expect(within(emDia).getByRole("combobox", { name: "Mais ações" })).toBeInTheDocument();

    await usuario.click(within(emDia).getByRole("button", { name: "Aprovar" }));
    expect(mocks.modalProps).toHaveBeenLastCalledWith(expect.objectContaining({ acao: "aprovar", vendaId: 50 }));
  });

  it("Aprovado mostra Marcar entregue e a data da aprovação, sem validade", async () => {
    mocks.listar.mockResolvedValue({
      items: [{ ...comValidade(3, "APROVADO", "2020-01-01"), decidido_em: "2026-11-12 14:00:00+00", forma_pagamento_codigo: "PIX" }],
      total: 1,
    });
    render(<OrcamentosInsumosTab />);
    const linhaAprovada = await screen.findByRole("row", { name: /abrir orçamento OI-3/i });
    expect(within(linhaAprovada).getByText("aprovado 12/11 · Pix")).toBeInTheDocument();
    expect(within(linhaAprovada).queryByText("Vencido")).not.toBeInTheDocument();
    expect(within(linhaAprovada).getByRole("button", { name: "Marcar entregue" })).toBeInTheDocument();
  });

  it("sem Ações financeiras: sem Novo orçamento, sem ⋯ e a ação vira Ver", async () => {
    mocks.hasPermission.mockReturnValue(false);
    render(<OrcamentosInsumosTab />);
    const linhaRascunho = await screen.findByRole("row", { name: /abrir orçamento OI-1/i });
    expect(within(linhaRascunho).getByRole("button", { name: /ver orçamento OI-1/i })).toBeInTheDocument();
    expect(within(linhaRascunho).queryByRole("combobox", { name: "Mais ações" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /novo orçamento/i })).not.toBeInTheDocument();
    expect(screen.getByText(/troque para um perfil com/i)).toBeInTheDocument();
  });

  it("filtro sem resultado diz o filtro e a busca e oferece limpar", async () => {
    const usuario = userEvent.setup();
    render(<OrcamentosInsumosTab />);
    await screen.findByText("OI-2");
    mocks.listar.mockImplementation(async ({ busca }: { busca?: string }) =>
      busca ? { items: [], total: 0 } : { items: [linha(2, "APROVADO", 150)], total: 1 },
    );
    fireEvent.change(screen.getByLabelText("Buscar orçamento"), { target: { value: "Padaria" } });
    expect(await screen.findByText('Nenhum orçamento de "Padaria".')).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(screen.getByLabelText("Buscar orçamento")).toHaveValue("");
    expect(await screen.findByText("OI-2")).toBeInTheDocument();
  });
});

function telaEstreita() {
  const original = window.matchMedia;
  window.matchMedia = ((consulta: string) => ({
    matches: false,
    media: consulta,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe("Vendas de insumos no celular (V.6)", () => {
  it("abaixo de 768px a tabela vira cartões com a ação de 44px e o ⋯", async () => {
    const restaurar = telaEstreita();
    try {
      mocks.hasPermission.mockReturnValue(true);
      mocks.listar.mockResolvedValue({ items: [{ ...linha(5, "ENVIADO", 100), validade: "2999-12-31" }], total: 1 });
      render(<OrcamentosInsumosTab />);
      const lista = await screen.findByRole("list", { name: "Orçamentos de insumos" });
      expect(screen.queryByRole("table")).toBeNull();
      const cartao = within(lista).getByRole("listitem");
      expect(within(cartao).getByText("OI-5")).toBeInTheDocument();
      const aprovar = within(cartao).getByRole("button", { name: "Aprovar" });
      expect(aprovar).toHaveClass("h-11");
      expect(within(cartao).getByRole("combobox", { name: "Mais ações" })).toHaveClass("h-11");
      await userEvent.click(within(cartao).getByRole("button", { name: "Abrir orçamento OI-5" }));
      expect(mocks.navigate).toHaveBeenCalledWith("/vendas/50");
    } finally {
      restaurar();
    }
  });
});
