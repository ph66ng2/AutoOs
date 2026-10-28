import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Cliente, OrcamentoInsumosDetalhe, StatusOrcamentoInsumos } from "@/types";

const mocks = vi.hoisted(() => ({
  db: {
    obterOrcamentoInsumos: vi.fn(),
    buscarCliente: vi.fn(),
    criarOrcamentoInsumos: vi.fn(),
    atualizarOrcamentoInsumos: vi.fn(),
    aprovarOrcamentoInsumos: vi.fn(),
    reprovarOrcamentoInsumos: vi.fn(),
    cancelarOrcamentoInsumos: vi.fn(),
    excluirOrcamentoInsumos: vi.fn(),
    marcarOrcamentoInsumosEntregue: vi.fn(),
    marcarOrcamentoInsumosEnviado: vi.fn(),
    listarProdutos: vi.fn(),
  },
  ensureSensitiveAccess: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  showError: vi.fn(),
  enviarEmail: vi.fn(),
  enviarWhatsapp: vi.fn(),
  construirPdf: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensureSensitiveAccess }),
}));
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ success: mocks.success, warning: mocks.warning, error: mocks.showError, info: vi.fn() }),
}));
vi.mock("@/lib/orcamento-insumos-service", () => ({
  OrcamentoInsumosService: { enviarEmail: mocks.enviarEmail, enviarWhatsapp: mocks.enviarWhatsapp },
}));
vi.mock("@/lib/pdf-service", () => ({
  PdfService: { construirOrcamentoInsumos: mocks.construirPdf, salvarOrcamentoInsumos: vi.fn() },
}));
vi.mock("@/components/equipamentos/PdfPreviewDialog", () => ({
  PdfPreviewDialog: ({ artifact }: { artifact: { filename: string } | null }) =>
    artifact ? <div data-testid="pdf-preview">{artifact.filename}</div> : null,
}));
vi.mock("@/components/equipamentos/ContatoResponsavelSelector", () => ({
  ContatoResponsavelSelector: () => <div data-testid="contato-selector" />,
}));
vi.mock("@/components/equipamentos/ClienteSelector", () => ({
  ClienteSelector: ({
    clienteInicial,
    onClienteSelecionado,
  }: {
    clienteInicial?: Cliente | null;
    onClienteSelecionado: (cliente: Cliente) => void;
  }) => (
    <div>
      <span data-testid="cliente-atual">{clienteInicial?.nome ?? "nenhum"}</span>
      <button type="button" onClick={() => onClienteSelecionado(CLIENTE)}>
        Escolher cliente
      </button>
    </div>
  ),
}));

import { OrcamentoInsumosDialog } from "@/pages/insumos/OrcamentoInsumosDialog";

const CLIENTE: Cliente = { id: 3, empresa_id: 1, nome: "Gráfica Alfa", tipo_pessoa: "PJ", documento: "57522734000158" };

const PRODUTO = {
  id: 10,
  codigo: "ETQ-1",
  nome: "Etiqueta 100x50",
  categoria: "ETIQUETA",
  quantidade_estoque: 4,
  quantidade_minima: 1,
  preco_custo: 3,
  preco_venda: 10,
};

function detalhe(status: StatusOrcamentoInsumos = "RASCUNHO", sobrescrever: Partial<OrcamentoInsumosDetalhe> = {}): OrcamentoInsumosDetalhe {
  return {
    id: 7,
    empresa_id: 1,
    numero: 12,
    numero_exibicao: "OI-12",
    cliente_id: 3,
    cliente_nome: "Gráfica Alfa",
    cliente_documento: "57522734000158",
    contato_id: null,
    status,
    validade: "2026-11-01",
    observacoes: null,
    desconto: 0,
    valor_subtotal: 30,
    valor_total: 30,
    forma_pagamento_codigo: status === "APROVADO" || status === "ENTREGUE" ? "PIX" : null,
    criado_em: "2026-10-20 14:03:05+00",
    atualizado_em: `token-${status}`,
    total_itens: 1,
    itens: [
      { id: 1, orcamento_id: 7, produto_id: 10, descricao: "Etiqueta 100x50", categoria: "ETIQUETA", quantidade: 3, valor_unitario: 10, valor_total: 30, saldo_estoque: 4 },
    ],
    ...sobrescrever,
  };
}

async function abrir(status: StatusOrcamentoInsumos, sobrescrever: Partial<OrcamentoInsumosDetalhe> = {}) {
  mocks.db.obterOrcamentoInsumos.mockResolvedValue(detalhe(status, sobrescrever));
  const onChanged = vi.fn();
  const onOpenChange = vi.fn();
  render(<OrcamentoInsumosDialog open onOpenChange={onOpenChange} orcamentoId={7} onChanged={onChanged} />);
  await screen.findByText("Orçamento de insumos OI-12");
  return { onChanged, onOpenChange };
}

const botao = (nome: RegExp | string) => screen.queryByRole("button", { name: nome });

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
  mocks.construirPdf.mockResolvedValue({ filename: "Orcamento_Insumos_OI-12.pdf", bytes: new Uint8Array([1]), mimeType: "application/pdf" });
});

describe("OrcamentoInsumosDialog: novo orçamento", () => {
  it("calcula o total com desconto, usa o preço de venda e salva só os dados de entrada", async () => {
    mocks.db.criarOrcamentoInsumos.mockResolvedValue(detalhe("RASCUNHO"));
    const onChanged = vi.fn();
    render(<OrcamentoInsumosDialog open onOpenChange={vi.fn()} orcamentoId={null} onChanged={onChanged} />);

    expect(screen.getByText("Novo orçamento de insumos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    expect(botao(/gerar pdf/i)).toBeNull();
    expect(botao(/aprovar/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Escolher cliente" }));
    fireEvent.change(screen.getByLabelText("Buscar produto do estoque"), { target: { value: "etiq" } });
    const opcao = await screen.findByRole("option", { name: /etiqueta 100x50/i });
    expect(within(opcao).getByText(/saldo 4/i)).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /zebra zd220/i })).toBeNull();
    fireEvent.click(within(opcao).getByRole("button"));

    const quantidade = screen.getByLabelText("Quantidade de Etiqueta 100x50");
    const unitario = screen.getByLabelText("Valor unitário de Etiqueta 100x50");
    expect(unitario).toHaveValue("10,00");
    fireEvent.change(quantidade, { target: { value: "3" } });
    fireEvent.change(unitario, { target: { value: "12.5" } });
    fireEvent.change(screen.getByLabelText("Desconto (R$)"), { target: { value: "7.5" } });

    const totais = screen.getByLabelText("Totais");
    expect(totais).toHaveTextContent(/Subtotal\s*R\$\s*37,50/);
    expect(screen.getByTestId("total-geral")).toHaveTextContent(/R\$\s*30,00/);

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mocks.db.criarOrcamentoInsumos).toHaveBeenCalledTimes(1));
    const enviado = mocks.db.criarOrcamentoInsumos.mock.calls[0][0];
    expect(enviado).toMatchObject({
      cliente_id: 3,
      contato_id: null,
      desconto: 7.5,
      itens: [{ produto_id: 10, quantidade: 3, valor_unitario: 12.5 }],
    });
    expect(enviado.validade).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(enviado).not.toHaveProperty("valor_total");
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("explica por que o Salvar está desabilitado quando a quantidade é zero", async () => {
    render(<OrcamentoInsumosDialog open onOpenChange={vi.fn()} orcamentoId={null} />);
    expect(screen.getByTestId("motivo-sem-salvar")).toHaveTextContent("Escolha o cliente para salvar.");
    fireEvent.click(screen.getByRole("button", { name: "Escolher cliente" }));
    expect(screen.getByTestId("motivo-sem-salvar")).toHaveTextContent("Inclua ao menos um item para salvar.");
    fireEvent.change(screen.getByLabelText("Buscar produto do estoque"), { target: { value: "etiq" } });
    fireEvent.click(within(await screen.findByRole("option", { name: /etiqueta 100x50/i })).getByRole("button"));

    fireEvent.change(screen.getByLabelText("Quantidade de Etiqueta 100x50"), { target: { value: "0" } });
    expect(within(screen.getByTestId("item-10")).getByText("Informe uma quantidade maior que zero")).toBeInTheDocument();
    expect(screen.getByTestId("motivo-sem-salvar")).toHaveTextContent("Informe uma quantidade maior que zero em todos os itens.");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Quantidade de Etiqueta 100x50"), { target: { value: "2" } });
    expect(screen.queryByTestId("motivo-sem-salvar")).toBeNull();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("avisa saldo insuficiente e bloqueia desconto maior que o total", async () => {
    render(<OrcamentoInsumosDialog open onOpenChange={vi.fn()} orcamentoId={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Escolher cliente" }));
    fireEvent.change(screen.getByLabelText("Buscar produto do estoque"), { target: { value: "etiq" } });
    fireEvent.click(within(await screen.findByRole("option", { name: /etiqueta 100x50/i })).getByRole("button"));

    fireEvent.change(screen.getByLabelText("Quantidade de Etiqueta 100x50"), { target: { value: "9" } });
    expect(screen.getByRole("status")).toHaveTextContent(/Saldo menor que o pedido em: Etiqueta 100x50 \(saldo 4\)/);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();

    fireEvent.change(screen.getByLabelText("Desconto (R$)"), { target: { value: "200" } });
    expect(screen.getByText("O desconto passa do total dos itens.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("não inclui o mesmo produto duas vezes: soma a quantidade", async () => {
    render(<OrcamentoInsumosDialog open onOpenChange={vi.fn()} orcamentoId={null} />);
    for (let vez = 0; vez < 2; vez += 1) {
      fireEvent.change(screen.getByLabelText("Buscar produto do estoque"), { target: { value: "etiq" } });
      fireEvent.click(within(await screen.findByRole("option", { name: /etiqueta 100x50/i })).getByRole("button"));
    }
    expect(screen.getAllByLabelText("Quantidade de Etiqueta 100x50")).toHaveLength(1);
    expect(screen.getByLabelText("Quantidade de Etiqueta 100x50")).toHaveValue(2);
  });
});

describe("OrcamentoInsumosDialog: ações por status", () => {
  it("rascunho: salvar, PDF, e-mail, WhatsApp, aprovar, reprovar e cancelar; sem entregar", async () => {
    await abrir("RASCUNHO");
    for (const nome of [/^salvar$/i, /gerar pdf/i, /enviar por e-mail/i, /enviar por whatsapp/i, /^aprovar$/i, /^reprovar$/i, /cancelar orçamento/i]) {
      expect(botao(nome), String(nome)).toBeInTheDocument();
    }
    expect(botao(/marcar entregue/i)).toBeNull();
    expect(screen.getByTestId("cliente-atual")).toHaveTextContent("Gráfica Alfa");
  });

  it("aprovado: entregar e cancelar, sem edição nem nova aprovação, e mostra o pagamento", async () => {
    await abrir("APROVADO");
    expect(botao(/marcar entregue/i)).toBeInTheDocument();
    expect(botao(/cancelar orçamento/i)).toBeInTheDocument();
    expect(botao(/gerar pdf/i)).toBeInTheDocument();
    for (const nome of [/^salvar$/i, /^aprovar$/i, /^reprovar$/i, /enviar por e-mail/i]) {
      expect(botao(nome), String(nome)).toBeNull();
    }
    expect(screen.queryByTestId("cliente-atual")).toBeNull();
    expect(screen.getByText(/Pagamento: Pix/)).toBeInTheDocument();
    expect(screen.getByLabelText("Quantidade de Etiqueta 100x50")).toBeDisabled();
  });

  it.each(["ENTREGUE", "CANCELADO", "REPROVADO"] as const)("%s: só consulta e gera PDF", async (status) => {
    await abrir(status);
    expect(botao(/gerar pdf/i)).toBeInTheDocument();
    for (const nome of [/^salvar$/i, /^aprovar$/i, /^reprovar$/i, /marcar entregue/i, /cancelar orçamento/i]) {
      expect(botao(nome), String(nome)).toBeNull();
    }
  });

  it("editar um orçamento bloqueia PDF, envio e aprovação até salvar", async () => {
    await abrir("ENVIADO");
    expect(botao(/gerar pdf/i)).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "novo texto" } });
    expect(botao(/gerar pdf/i)).toBeDisabled();
    expect(botao(/enviar por e-mail/i)).toBeDisabled();
    expect(botao(/^aprovar$/i)).toBeDisabled();
    expect(screen.getByText(/volta para rascunho/i)).toBeInTheDocument();
    expect(screen.getByText(/Salve as alterações para gerar o PDF/i)).toBeInTheDocument();
  });

  it("salvar um existente manda o token de concorrência", async () => {
    mocks.db.atualizarOrcamentoInsumos.mockResolvedValue(detalhe("RASCUNHO", { atualizado_em: "token-novo" }));
    await abrir("RASCUNHO");
    fireEvent.change(screen.getByLabelText("Quantidade de Etiqueta 100x50"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(mocks.db.atualizarOrcamentoInsumos).toHaveBeenCalledTimes(1));
    const [id, entrada] = mocks.db.atualizarOrcamentoInsumos.mock.calls[0];
    expect(id).toBe(7);
    expect(entrada).toMatchObject({ atualizado_em: "token-RASCUNHO", cliente_id: 3, itens: [{ produto_id: 10, quantidade: 2, valor_unitario: 10 }] });
  });

  it("mostra o erro de concorrência vindo do backend sem perder o que foi digitado", async () => {
    mocks.db.atualizarOrcamentoInsumos.mockRejectedValue("Conflito de concorrência: o orçamento foi alterado por outro técnico.");
    await abrir("RASCUNHO");
    fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "minha anotação" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Conflito de concorrência/);
    expect(screen.getByLabelText("Observações")).toHaveValue("minha anotação");
  });

  it.each(["RASCUNHO", "ENVIADO", "APROVADO", "ENTREGUE", "REPROVADO"] as const)("%s: não oferece excluir", async (status) => {
    await abrir(status);
    expect(botao(/^excluir$/i)).toBeNull();
  });

  it("cancelado: excluir pede confirmação, PIN e apaga o orçamento", async () => {
    mocks.db.excluirOrcamentoInsumos.mockResolvedValue(undefined);
    const { onChanged, onOpenChange } = await abrir("CANCELADO");
    fireEvent.click(screen.getByRole("button", { name: /^excluir$/i }));
    const confirmacao = await screen.findByRole("alertdialog");
    expect(confirmacao).toHaveTextContent(/não pode ser desfeita/i);
    fireEvent.click(within(confirmacao).getByRole("button", { name: /^excluir$/i }));

    await waitFor(() => expect(mocks.db.excluirOrcamentoInsumos).toHaveBeenCalledWith(7, "token-CANCELADO"));
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("voltar na confirmação de exclusão não apaga nada", async () => {
    await abrir("CANCELADO");
    fireEvent.click(screen.getByRole("button", { name: /^excluir$/i }));
    const confirmacao = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Voltar" }));
    expect(mocks.db.excluirOrcamentoInsumos).not.toHaveBeenCalled();
  });

  it("PIN recusado não apaga o orçamento", async () => {
    mocks.ensureSensitiveAccess.mockResolvedValue(false);
    await abrir("CANCELADO");
    fireEvent.click(screen.getByRole("button", { name: /^excluir$/i }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /^excluir$/i }));
    await waitFor(() => expect(mocks.ensureSensitiveAccess).toHaveBeenCalled());
    expect(mocks.db.excluirOrcamentoInsumos).not.toHaveBeenCalled();
  });

  it("backend rejeita a exclusão: mostra o motivo e mantém o diálogo aberto", async () => {
    mocks.db.excluirOrcamentoInsumos.mockRejectedValue("Conflito de concorrência: outro usuário alterou este orçamento.");
    const { onOpenChange } = await abrir("CANCELADO");
    fireEvent.click(screen.getByRole("button", { name: /^excluir$/i }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /^excluir$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Conflito de concorrência: outro usuário alterou este orçamento.");
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe("OrcamentoInsumosDialog: aprovar, cancelar, reprovar e entregar", () => {
  it("aprovar pede a forma de pagamento e envia o token", async () => {
    mocks.db.aprovarOrcamentoInsumos.mockResolvedValue(detalhe("APROVADO"));
    const { onChanged } = await abrir("ENVIADO");
    fireEvent.click(screen.getByRole("button", { name: /^aprovar$/i }));
    expect(await screen.findByText("Forma de pagamento da aprovação")).toBeInTheDocument();
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));

    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));
    expect(screen.getByText(/escolha uma forma/i)).toBeInTheDocument();
    expect(mocks.db.aprovarOrcamentoInsumos).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));
    await waitFor(() => expect(mocks.db.aprovarOrcamentoInsumos).toHaveBeenCalledWith(7, "token-ENVIADO", { codigo: "PIX", detalhe: null }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(await screen.findByText(/Pagamento: Pix/)).toBeInTheDocument();
  });

  it("falta de estoque mantém o diálogo aberto e lista o que falta", async () => {
    mocks.db.aprovarOrcamentoInsumos.mockRejectedValue(
      "Estoque insuficiente para aprovar OI-12. Nada foi baixado.\n- Etiqueta 100x50: precisa de 3, há 1 em estoque",
    );
    await abrir("RASCUNHO");
    fireEvent.click(screen.getByRole("button", { name: /^aprovar$/i }));
    await screen.findByText("Forma de pagamento da aprovação");
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "A_COMBINAR" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));

    await waitFor(() => expect(screen.getAllByText(/precisa de 3, há 1 em estoque/).length).toBeGreaterThan(0));
    expect(screen.getByText("Forma de pagamento da aprovação")).toBeInTheDocument();
    expect(screen.getByText("Orçamento de insumos OI-12")).toBeInTheDocument();
  });

  it("PIN recusado não abre a aprovação", async () => {
    mocks.ensureSensitiveAccess.mockResolvedValue(false);
    await abrir("RASCUNHO");
    fireEvent.click(screen.getByRole("button", { name: /^aprovar$/i }));
    await waitFor(() => expect(mocks.ensureSensitiveAccess).toHaveBeenCalled());
    expect(screen.queryByText("Forma de pagamento da aprovação")).toBeNull();
  });

  it("cancelar um aprovado explica a devolução e confirma a devolução ao estoque", async () => {
    mocks.db.cancelarOrcamentoInsumos.mockResolvedValue(detalhe("CANCELADO"));
    await abrir("APROVADO");
    fireEvent.click(screen.getByRole("button", { name: /cancelar orçamento/i }));
    const confirmacao = await screen.findByRole("alertdialog");
    expect(confirmacao).toHaveTextContent(/voltam para o estoque/i);
    fireEvent.click(within(confirmacao).getByRole("button", { name: /cancelar e devolver ao estoque/i }));
    await waitFor(() => expect(mocks.db.cancelarOrcamentoInsumos).toHaveBeenCalledWith(7, "token-APROVADO", true));
  });

  it("cancelar um rascunho não pede devolução de estoque", async () => {
    mocks.db.cancelarOrcamentoInsumos.mockResolvedValue(detalhe("CANCELADO"));
    await abrir("RASCUNHO");
    fireEvent.click(screen.getByRole("button", { name: /cancelar orçamento/i }));
    const confirmacao = await screen.findByRole("alertdialog");
    expect(confirmacao).not.toHaveTextContent(/estoque/i);
    fireEvent.click(within(confirmacao).getByRole("button", { name: /^cancelar orçamento$/i }));
    await waitFor(() => expect(mocks.db.cancelarOrcamentoInsumos).toHaveBeenCalledWith(7, "token-RASCUNHO", false));
  });

  it("voltar na confirmação não altera nada", async () => {
    await abrir("RASCUNHO");
    fireEvent.click(screen.getByRole("button", { name: /^reprovar$/i }));
    const confirmacao = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Voltar" }));
    expect(mocks.db.reprovarOrcamentoInsumos).not.toHaveBeenCalled();
  });

  it("reprovar e marcar entregue chamam o backend com o token", async () => {
    mocks.db.reprovarOrcamentoInsumos.mockResolvedValue(detalhe("REPROVADO"));
    mocks.db.marcarOrcamentoInsumosEntregue.mockResolvedValue(detalhe("ENTREGUE"));

    const primeiro = await abrir("ENVIADO");
    fireEvent.click(screen.getByRole("button", { name: /^reprovar$/i }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /^reprovar$/i }));
    await waitFor(() => expect(mocks.db.reprovarOrcamentoInsumos).toHaveBeenCalledWith(7, "token-ENVIADO"));
    await waitFor(() => expect(primeiro.onChanged).toHaveBeenCalled());
  });

  it("marcar entregue pede confirmação", async () => {
    mocks.db.marcarOrcamentoInsumosEntregue.mockResolvedValue(detalhe("ENTREGUE"));
    await abrir("APROVADO");
    fireEvent.click(screen.getByRole("button", { name: /marcar entregue/i }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: /marcar entregue/i }));
    await waitFor(() => expect(mocks.db.marcarOrcamentoInsumosEntregue).toHaveBeenCalledWith(7, "token-APROVADO"));
  });
});

describe("OrcamentoInsumosDialog: PDF e envios", () => {
  it("gera o PDF a partir do orçamento salvo e mostra a prévia", async () => {
    await abrir("RASCUNHO");
    fireEvent.click(screen.getByRole("button", { name: /gerar pdf/i }));
    expect(await screen.findByTestId("pdf-preview")).toHaveTextContent("Orcamento_Insumos_OI-12.pdf");
    expect(mocks.construirPdf).toHaveBeenCalledWith(expect.objectContaining({ numero_exibicao: "OI-12" }));
  });

  it("e-mail enviado marca o orçamento como enviado pelo canal EMAIL", async () => {
    mocks.enviarEmail.mockResolvedValue({ sucesso: true });
    mocks.db.marcarOrcamentoInsumosEnviado.mockResolvedValue(detalhe("ENVIADO"));
    await abrir("RASCUNHO");
    fireEvent.click(screen.getByRole("button", { name: /enviar por e-mail/i }));
    await waitFor(() => expect(mocks.db.marcarOrcamentoInsumosEnviado).toHaveBeenCalledWith(7, "token-RASCUNHO", "EMAIL"));
    expect(mocks.enviarEmail).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Enviado")).toBeInTheDocument();
  });

  it("WhatsApp enviado marca pelo canal WHATSAPP", async () => {
    mocks.enviarWhatsapp.mockResolvedValue({ sucesso: true });
    mocks.db.marcarOrcamentoInsumosEnviado.mockResolvedValue(detalhe("ENVIADO"));
    await abrir("RASCUNHO");
    fireEvent.click(screen.getByRole("button", { name: /enviar por whatsapp/i }));
    await waitFor(() => expect(mocks.db.marcarOrcamentoInsumosEnviado).toHaveBeenCalledWith(7, "token-RASCUNHO", "WHATSAPP"));
  });

  it("envio que falha não marca como enviado e mostra o motivo", async () => {
    mocks.enviarEmail.mockResolvedValue({ sucesso: false, erro: "O cliente e o contato não têm e-mail cadastrado." });
    await abrir("RASCUNHO");
    fireEvent.click(screen.getByRole("button", { name: /enviar por e-mail/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/não têm e-mail/);
    expect(mocks.db.marcarOrcamentoInsumosEnviado).not.toHaveBeenCalled();
  });
});

describe("OrcamentoInsumosDialog: carga pendente", () => {
  it("não deixa o novo orçamento preso em 'Carregando' depois de fechar um existente com a carga pendente", async () => {
    mocks.db.obterOrcamentoInsumos.mockReturnValue(new Promise(() => undefined));
    const { rerender } = render(<OrcamentoInsumosDialog open onOpenChange={vi.fn()} orcamentoId={7} />);
    expect(await screen.findByText("Carregando orçamento...")).toBeInTheDocument();

    rerender(<OrcamentoInsumosDialog open={false} onOpenChange={vi.fn()} orcamentoId={7} />);
    rerender(<OrcamentoInsumosDialog open onOpenChange={vi.fn()} orcamentoId={null} />);

    expect(screen.getByText("Novo orçamento de insumos")).toBeInTheDocument();
    expect(screen.queryByText("Carregando orçamento...")).toBeNull();
    expect(screen.getByLabelText("Desconto (R$)")).toBeInTheDocument();
  });
});
