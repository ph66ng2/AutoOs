import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { OrcamentoInsumosDetalhe } from "@/types";

const mocks = vi.hoisted(() => ({
  obter: vi.fn(),
  hasPermission: vi.fn(() => true),
  dialogProps: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { obterOrcamentoInsumos: mocks.obter } }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ hasPermission: mocks.hasPermission, ensureSensitiveAccess: vi.fn() }),
}));
// V.5: as ações abrem o modal próprio (AcaoVendaDialog); as props são lidas como antes.
vi.mock("@/components/vendas/AcaoVendaDialog", () => ({
  AcaoVendaDialog: (modal: { acao: string | null }) => {
    const props = { open: modal.acao != null, acaoInicial: modal.acao };
    mocks.dialogProps(props);
    return props.open ? <div data-testid="janela">{props.acaoInicial ?? "sem-acao"}</div> : null;
  },
}));
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

import VendaDetalhe from "./VendaDetalhe";

function venda(extra: Partial<OrcamentoInsumosDetalhe> = {}): OrcamentoInsumosDetalhe {
  return {
    id: 34, empresa_id: 1, numero: 34, numero_exibicao: "OI-34", cliente_id: 3, cliente_nome: "Mercado Bom Preço",
    cliente_documento: "12345678000190", cliente_email: "compras@bompreco.test", cliente_telefone: "1133445566",
    cliente_receber_email: true, cliente_receber_whatsapp: true, contato_nome: "Lúcia Costa",
    status: "ENVIADO", validade: "2999-12-31", observacoes: "Entrega junto com a próxima retirada.",
    desconto: 32, valor_subtotal: 1218, valor_total: 1186,
    criado_em: "2026-11-09 17:02:00+00", atualizado_em: "2026-11-11 12:15:00+00", enviado_em: "2026-11-11 12:15:00+00",
    total_itens: 2,
    itens: [
      { id: 1, orcamento_id: 34, produto_id: 9, descricao: "Ribbon cera 110x74", categoria: "RIBBON", quantidade: 10, valor_unitario: 32, valor_total: 320, saldo_estoque: 6 },
      { id: 2, orcamento_id: 34, produto_id: 7, descricao: "Etiqueta térmica 100x50", categoria: "ETIQUETA", quantidade: 20, valor_unitario: 38.9, valor_total: 778, saldo_estoque: 42 },
    ],
    ...extra,
  } as OrcamentoInsumosDetalhe;
}

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={["/vendas/34"]}>
      <Routes>
        <Route path="/vendas/:id" element={<VendaDetalhe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VendaDetalhe (/vendas/:id)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPermission.mockReturnValue(true);
  });

  it("Enviado com falta de estoque: etapas, saldo de agora, aviso e ações", async () => {
    mocks.obter.mockResolvedValue(venda());
    const usuario = userEvent.setup();
    renderPagina();
    expect(await screen.findByRole("heading", { name: "OI-34" })).toBeInTheDocument();
    const etapas = screen.getByRole("region", { name: "Etapas do orçamento" });
    expect(within(etapas).getByText("Enviado").closest("[aria-current]")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("6 · falta 4")).toBeInTheDocument();
    expect(screen.getByText(/Ribbon cera 110x74: precisa de 10, há 6/)).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "Dar entrada no estoque" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/insumos?entrada=9&quantidade=4&voltar=%2Fvendas%2F34");

    await usuario.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(screen.getByTestId("janela")).toHaveTextContent("aprovar");
  });

  it("com mais de um item faltando, cada um tem o seu Dar entrada com a quantidade dele", async () => {
    const base = venda();
    mocks.obter.mockResolvedValue(venda({ itens: [base.itens[0], { ...base.itens[1], saldo_estoque: 5 }] }));
    const usuario = userEvent.setup();
    renderPagina();
    expect(await screen.findByText("Etiqueta térmica 100x50: precisa de 20, há 5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dar entrada no estoque" })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Dar entrada no estoque: Etiqueta térmica 100x50" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/insumos?entrada=7&quantidade=15&voltar=%2Fvendas%2F34");
  });

  it("Editar quantidades e Renovar validade levam ao formulário em página", async () => {
    mocks.obter.mockResolvedValue(venda());
    const usuario = userEvent.setup();
    renderPagina();
    await usuario.click(await screen.findByRole("button", { name: "Editar quantidades" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/vendas/34/editar");
  });

  it("vencido mostra o aviso e a ação vira Renovar validade", async () => {
    mocks.obter.mockResolvedValue(venda({ validade: "2020-01-08" }));
    renderPagina();
    expect(await screen.findByText("Orçamento vencido")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renovar validade" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Renovar validade" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/vendas/34/editar?foco=validade");
  });

  it("cancelado depois de aprovado: barra para em Cancelado, sem data, e a ação é excluir de vez", async () => {
    mocks.obter.mockResolvedValue(venda({ status: "CANCELADO", decidido_em: "2026-11-12 13:40:00+00" }));
    renderPagina();
    expect(await screen.findByText(/Cancelado depois de aprovado: os itens voltaram ao estoque/)).toBeInTheDocument();
    const etapas = screen.getByRole("region", { name: "Etapas do orçamento" });
    const cancelado = within(etapas).getByText("Cancelado").closest("[aria-current]")!;
    expect(cancelado.textContent).toBe("Cancelado");
    expect(screen.getByRole("button", { name: "Excluir de vez" })).toBeInTheDocument();
    expect(screen.queryByText(/Saldo agora/)).not.toBeInTheDocument();
  });

  it("sem Ações financeiras: só leitura, Ver PDF, sem ⋯ e sem dar entrada", async () => {
    mocks.hasPermission.mockReturnValue(false);
    mocks.obter.mockResolvedValue(venda());
    const usuario = userEvent.setup();
    renderPagina();
    expect(await screen.findByText(/Só leitura/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Mais ações" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dar entrada no estoque" })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Ver PDF" }));
    expect(screen.getByTestId("janela")).toHaveTextContent("pdf");
  });

  it("cliente que não quer WhatsApp: canal riscado e aviso", async () => {
    mocks.obter.mockResolvedValue(venda({ cliente_receber_whatsapp: false }));
    renderPagina();
    expect(await screen.findByText(/pediu para não receber WhatsApp/)).toBeInTheDocument();
    expect(screen.getByText("WhatsApp").className).toMatch(/line-through/);
  });
});
