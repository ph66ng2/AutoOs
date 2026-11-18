/**
 * Regras do formulário do orçamento de insumos, com o hook real (useOrcamentoInsumosEditor).
 * Vieram dos testes da antiga janela OrcamentoInsumosDialog, que deu lugar às páginas
 * /vendas/novo e /vendas/:id/editar (V.4) e aos modais por ação (V.5).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Cliente, OrcamentoInsumosDetalhe, StatusOrcamentoInsumos } from "@/types";

const mocks = vi.hoisted(() => ({
  db: {
    obterOrcamentoInsumos: vi.fn(),
    buscarCliente: vi.fn(),
    criarOrcamentoInsumos: vi.fn(),
    atualizarOrcamentoInsumos: vi.fn(),
    listarProdutos: vi.fn(),
  },
  ensureSensitiveAccess: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensureSensitiveAccess, hasPermission: () => true }),
}));
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/components/equipamentos/ContatoResponsavelSelector", () => ({
  ContatoResponsavelSelector: () => <div data-testid="contato-selector" />,
}));
vi.mock("@/components/equipamentos/ClienteSelector", () => ({
  ClienteSelector: ({ clienteInicial, onClienteSelecionado }: { clienteInicial?: Cliente | null; onClienteSelecionado: (cliente: Cliente) => void }) => (
    <div>
      <span data-testid="cliente-atual">{clienteInicial?.nome ?? "nenhum"}</span>
      <button type="button" onClick={() => onClienteSelecionado(CLIENTE)}>
        Escolher cliente
      </button>
    </div>
  ),
}));
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

import VendaFormulario from "./VendaFormulario";

const CLIENTE: Cliente = { id: 3, empresa_id: 1, nome: "Gráfica Alfa", tipo_pessoa: "PJ", documento: "57522734000158" };
const PRODUTO = {
  id: 10, codigo: "ETQ-1", nome: "Etiqueta 100x50", categoria: "ETIQUETA",
  quantidade_estoque: 4, quantidade_minima: 1, preco_custo: 3, preco_venda: 10,
};

function detalhe(status: StatusOrcamentoInsumos = "RASCUNHO", sobrescrever: Partial<OrcamentoInsumosDetalhe> = {}): OrcamentoInsumosDetalhe {
  return {
    id: 7, empresa_id: 1, numero: 12, numero_exibicao: "OI-12", cliente_id: 3, cliente_nome: "Gráfica Alfa",
    cliente_documento: "57522734000158", contato_id: null, status, validade: "2099-12-31", observacoes: null,
    desconto: 0, valor_subtotal: 30, valor_total: 30, forma_pagamento_codigo: null,
    criado_em: "2026-10-20 14:03:05+00", atualizado_em: `token-${status}`, total_itens: 1,
    itens: [{ id: 1, orcamento_id: 7, produto_id: 10, descricao: "Etiqueta 100x50", categoria: "ETIQUETA", quantidade: 3, valor_unitario: 10, valor_total: 30, saldo_estoque: 4 }],
    ...sobrescrever,
  };
}

function renderEm(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/vendas/novo" element={<VendaFormulario />} />
        <Route path="/vendas/:id/editar" element={<VendaFormulario />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function incluirEtiqueta() {
  fireEvent.change(screen.getByLabelText("Buscar produto do estoque"), { target: { value: "etiq" } });
  fireEvent.click(within(await screen.findByRole("option", { name: /etiqueta 100x50/i })).getByRole("button"));
}

async function editarExistente(status: StatusOrcamentoInsumos = "RASCUNHO") {
  mocks.db.obterOrcamentoInsumos.mockResolvedValue(detalhe(status));
  renderEm("/vendas/7/editar");
  await screen.findByRole("heading", { name: /Editar orçamento OI-12/ });
}

const salvarBotao = () => screen.getByRole("button", { name: "Salvar orçamento" });

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureSensitiveAccess.mockResolvedValue(true);
  mocks.db.buscarCliente.mockResolvedValue(CLIENTE);
  mocks.db.listarProdutos.mockResolvedValue([
    PRODUTO,
    { ...PRODUTO, id: 99, nome: "Zebra ZD220", categoria: "IMPRESSORA", preco_venda: 900 },
  ]);
});

describe("Formulário da venda: novo orçamento", () => {
  it("calcula o total com desconto, usa o preço de venda e salva só os dados de entrada", async () => {
    mocks.db.criarOrcamentoInsumos.mockResolvedValue(detalhe("RASCUNHO"));
    renderEm("/vendas/novo");
    expect(salvarBotao()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Escolher cliente" }));
    fireEvent.change(screen.getByLabelText("Buscar produto do estoque"), { target: { value: "etiq" } });
    const opcao = await screen.findByRole("option", { name: /etiqueta 100x50/i });
    expect(within(opcao).getByText(/saldo 4/i)).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /zebra zd220/i })).toBeNull();
    fireEvent.click(within(opcao).getByRole("button"));

    const unitario = screen.getByLabelText("Valor unitário de Etiqueta 100x50");
    expect(unitario).toHaveValue("10,00");
    fireEvent.change(screen.getByLabelText("Quantidade de Etiqueta 100x50"), { target: { value: "3" } });
    fireEvent.change(unitario, { target: { value: "12.5" } });
    fireEvent.change(screen.getByLabelText("Desconto (R$)"), { target: { value: "7.5" } });

    const totais = screen.getByLabelText("Totais");
    expect(totais).toHaveTextContent(/Subtotal\s*R\$\s*37,50/);
    expect(totais).toHaveTextContent(/Total\s*R\$\s*30,00/);

    fireEvent.click(salvarBotao());
    await waitFor(() => expect(mocks.db.criarOrcamentoInsumos).toHaveBeenCalledTimes(1));
    const enviado = mocks.db.criarOrcamentoInsumos.mock.calls[0][0];
    expect(enviado).toMatchObject({ cliente_id: 3, contato_id: null, desconto: 7.5, itens: [{ produto_id: 10, quantidade: 3, valor_unitario: 12.5 }] });
    expect(enviado.validade).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(enviado).not.toHaveProperty("valor_total");
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/vendas/7"));
  });

  it("explica por que o Salvar está desabilitado quando a quantidade é zero", async () => {
    renderEm("/vendas/novo");
    expect(screen.getByText("Escolha o cliente para salvar.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Escolher cliente" }));
    expect(screen.getByText("Inclua ao menos um item para salvar.")).toBeInTheDocument();
    await incluirEtiqueta();

    fireEvent.change(screen.getByLabelText("Quantidade de Etiqueta 100x50"), { target: { value: "0" } });
    expect(within(screen.getByTestId("item-10")).getByText("Informe uma quantidade maior que zero")).toBeInTheDocument();
    expect(screen.getByText("Informe uma quantidade maior que zero em todos os itens.")).toBeInTheDocument();
    expect(salvarBotao()).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Quantidade de Etiqueta 100x50"), { target: { value: "2" } });
    expect(screen.queryByText("Informe uma quantidade maior que zero em todos os itens.")).toBeNull();
    expect(salvarBotao()).toBeEnabled();
  });

  it("avisa saldo insuficiente e bloqueia desconto maior que o total", async () => {
    renderEm("/vendas/novo");
    fireEvent.click(screen.getByRole("button", { name: "Escolher cliente" }));
    await incluirEtiqueta();

    fireEvent.change(screen.getByLabelText("Quantidade de Etiqueta 100x50"), { target: { value: "9" } });
    expect(screen.getByRole("status")).toHaveTextContent(/Saldo menor que o pedido em: Etiqueta 100x50 \(saldo 4\)/);
    expect(salvarBotao()).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Desconto (R$)"), { target: { value: "200" } });
    expect(screen.getByText("O desconto passa do total dos itens.")).toBeInTheDocument();
    expect(salvarBotao()).toBeDisabled();
  });

  it("não inclui o mesmo produto duas vezes: soma a quantidade", async () => {
    renderEm("/vendas/novo");
    await incluirEtiqueta();
    await incluirEtiqueta();
    expect(screen.getAllByLabelText("Quantidade de Etiqueta 100x50")).toHaveLength(1);
    expect(screen.getByLabelText("Quantidade de Etiqueta 100x50")).toHaveValue(2);
  });
});

describe("Formulário da venda: editar", () => {
  it("carrega o cliente do orçamento e salva com o token de concorrência", async () => {
    mocks.db.atualizarOrcamentoInsumos.mockResolvedValue(detalhe("RASCUNHO", { atualizado_em: "token-novo" }));
    await editarExistente("RASCUNHO");
    expect(screen.getByTestId("cliente-atual")).toHaveTextContent("Gráfica Alfa");
    fireEvent.change(screen.getByLabelText("Quantidade de Etiqueta 100x50"), { target: { value: "2" } });
    fireEvent.click(salvarBotao());
    await waitFor(() => expect(mocks.db.atualizarOrcamentoInsumos).toHaveBeenCalledTimes(1));
    const [id, entrada] = mocks.db.atualizarOrcamentoInsumos.mock.calls[0];
    expect(id).toBe(7);
    expect(entrada).toMatchObject({ atualizado_em: "token-RASCUNHO", cliente_id: 3, itens: [{ produto_id: 10, quantidade: 2, valor_unitario: 10 }] });
  });

  it("mostra o erro de concorrência vindo do backend sem perder o que foi digitado", async () => {
    mocks.db.atualizarOrcamentoInsumos.mockRejectedValue("Conflito de concorrência: o orçamento foi alterado por outro técnico.");
    await editarExistente("RASCUNHO");
    fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "minha anotação" } });
    fireEvent.click(salvarBotao());
    expect(await screen.findByRole("alert")).toHaveTextContent(/Conflito de concorrência/);
    expect(screen.getByLabelText("Observações")).toHaveValue("minha anotação");
    expect(mocks.navigate).not.toHaveBeenCalledWith("/vendas/7");
  });

  it("PIN recusado não salva", async () => {
    mocks.ensureSensitiveAccess.mockResolvedValue(false);
    await editarExistente("RASCUNHO");
    fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "x" } });
    fireEvent.click(salvarBotao());
    await waitFor(() => expect(mocks.ensureSensitiveAccess).toHaveBeenCalled());
    expect(mocks.db.atualizarOrcamentoInsumos).not.toHaveBeenCalled();
  });

  it("enviado avisa que volta para Rascunho ao salvar", async () => {
    await editarExistente("ENVIADO");
    expect(screen.getByText(/volta para Rascunho/i)).toBeInTheDocument();
  });

  it.each(["APROVADO", "ENTREGUE", "CANCELADO", "REPROVADO"] as const)("%s: não abre o formulário", async (status) => {
    mocks.db.obterOrcamentoInsumos.mockResolvedValue(detalhe(status));
    renderEm("/vendas/7/editar");
    expect(await screen.findByText(/não pode mais ser editado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar orçamento" })).toBeNull();
  });
});
