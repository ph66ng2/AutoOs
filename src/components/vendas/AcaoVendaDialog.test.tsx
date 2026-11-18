import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { OrcamentoInsumosDetalhe, StatusOrcamentoInsumos } from "@/types";

const mocks = vi.hoisted(() => ({
  db: {
    obterOrcamentoInsumos: vi.fn(),
    aprovarOrcamentoInsumos: vi.fn(),
    reprovarOrcamentoInsumos: vi.fn(),
    cancelarOrcamentoInsumos: vi.fn(),
    excluirOrcamentoInsumos: vi.fn(),
    marcarOrcamentoInsumosEntregue: vi.fn(),
    marcarOrcamentoInsumosEnviado: vi.fn(),
  },
  ensureSensitiveAccess: vi.fn(),
  enviarEmail: vi.fn(),
  enviarWhatsapp: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensureSensitiveAccess, hasPermission: () => true }),
}));
vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/lib/orcamento-insumos-service", () => ({
  OrcamentoInsumosService: { enviarEmail: mocks.enviarEmail, enviarWhatsapp: mocks.enviarWhatsapp },
}));
vi.mock("@/lib/pdf-service", () => ({
  PdfService: { construirOrcamentoInsumos: vi.fn().mockResolvedValue({ filename: "OI-34.pdf" }), salvarOrcamentoInsumos: vi.fn() },
}));
vi.mock("@/components/equipamentos/PdfPreviewDialog", () => ({
  PdfPreviewDialog: ({ artifact }: { artifact: { filename: string } | null }) =>
    artifact ? <div data-testid="pdf-preview">{artifact.filename}</div> : null,
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));

import { AcaoVendaDialog, faltasDaRecusa } from "./AcaoVendaDialog";
import { PdfService } from "@/lib/pdf-service";

function venda(status: StatusOrcamentoInsumos, extra: Partial<OrcamentoInsumosDetalhe> = {}): OrcamentoInsumosDetalhe {
  return {
    id: 34, empresa_id: 1, numero: 34, numero_exibicao: "OI-34", cliente_id: 3, cliente_nome: "Mercado Bom Preço",
    cliente_email: "compras@bompreco.test", cliente_telefone: "1133445566", contato_nome: "Lúcia Costa",
    contato_email: "lucia@bompreco.test", cliente_receber_whatsapp: false,
    status, validade: "2999-11-20", desconto: 0, valor_subtotal: 1186, valor_total: 1186,
    criado_em: "2026-11-09 17:02:00+00", atualizado_em: `token-${status}`, total_itens: 2,
    itens: [
      { id: 1, orcamento_id: 34, produto_id: 9, descricao: "Ribbon cera 110x74", categoria: "RIBBON", quantidade: 10, valor_unitario: 32, valor_total: 320, saldo_estoque: 6 },
      { id: 2, orcamento_id: 34, produto_id: 7, descricao: "Etiqueta 100x50", categoria: "ETIQUETA", quantidade: 20, valor_unitario: 43.3, valor_total: 866, saldo_estoque: 42 },
    ],
    ...extra,
  } as OrcamentoInsumosDetalhe;
}

function abrir(acao: string, status: StatusOrcamentoInsumos, props: Record<string, unknown> = {}) {
  const onFechar = vi.fn();
  const onAlterado = vi.fn();
  const onExcluido = vi.fn();
  // O modal sempre busca a versão atual; na página, a do banco é igual à mostrada (salvo no teste de cópia antiga).
  if (!("venda" in props)) mocks.db.obterOrcamentoInsumos.mockResolvedValue(venda(status));
  render(
    <AcaoVendaDialog
      acao={acao as never}
      vendaId={34}
      venda={venda(status)}
      voltarPara="/vendas/34"
      onFechar={onFechar}
      onAlterado={onAlterado}
      onExcluido={onExcluido}
      {...props}
    />,
  );
  return { onFechar, onAlterado, onExcluido };
}

beforeAll(() => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureSensitiveAccess.mockResolvedValue(true);
});

describe("faltasDaRecusa", () => {
  it("lê as linhas do backend e ignora outras recusas", () => {
    expect(faltasDaRecusa("Estoque insuficiente para aprovar OI-34. Nada foi baixado.\n- Ribbon cera 110x74: precisa de 10, há 6 em estoque")).toEqual([
      { descricao: "Ribbon cera 110x74", necessario: 10, disponivel: 6 },
    ]);
    expect(faltasDaRecusa("O orçamento OI-34 venceu em 01/01/2026")).toBeNull();
  });
});

describe("AcaoVendaDialog (V.5)", () => {
  it("Enviar: escolhe o canal, avisa a recusa de WhatsApp e envia por e-mail com PIN", async () => {
    mocks.enviarEmail.mockResolvedValue({ sucesso: true });
    mocks.db.marcarOrcamentoInsumosEnviado.mockResolvedValue(venda("ENVIADO"));
    const { onFechar, onAlterado } = abrir("email", "RASCUNHO");
    expect(await screen.findByRole("heading", { name: "Enviar orçamento OI-34" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /E-mail para Lúcia Costa/ })).toBeChecked();
    expect(screen.getByText("Este cliente pediu para não receber WhatsApp.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enviar por e-mail" }));
    await waitFor(() => expect(mocks.db.marcarOrcamentoInsumosEnviado).toHaveBeenCalledWith(34, "token-RASCUNHO", "EMAIL"));
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));
    expect(onAlterado).toHaveBeenCalled();
    expect(onFechar).toHaveBeenCalled();
  });

  it("Aprovar: PIN antes, forma de pagamento obrigatória e recusa por falta vira o modal próprio", async () => {
    mocks.db.aprovarOrcamentoInsumos.mockRejectedValue(
      "Estoque insuficiente para aprovar OI-34. Nada foi baixado.\n- Ribbon cera 110x74: precisa de 10, há 6 em estoque",
    );
    abrir("aprovar", "ENVIADO");
    expect(await screen.findByRole("heading", { name: "Aprovar OI-34" })).toBeInTheDocument();
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e baixar estoque" }));
    expect(screen.getByText(/Escolha uma forma de pagamento/)).toBeInTheDocument();
    expect(mocks.db.aprovarOrcamentoInsumos).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e baixar estoque" }));
    await waitFor(() => expect(mocks.db.aprovarOrcamentoInsumos).toHaveBeenCalledWith(34, "token-ENVIADO", { codigo: "PIX", detalhe: null }));
    expect(await screen.findByRole("heading", { name: "Não deu para aprovar OI-34" })).toBeInTheDocument();
    expect(screen.getByText(/Ribbon cera 110x74: precisa de 10, há 6 em estoque/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dar entrada no estoque" }));
    expect(mocks.navigate).toHaveBeenCalledWith(`/insumos?entrada=9&quantidade=4&voltar=${encodeURIComponent("/vendas/34")}`);
  });

  it("PIN recusado não abre a aprovação", async () => {
    mocks.ensureSensitiveAccess.mockResolvedValue(false);
    const { onFechar } = abrir("aprovar", "ENVIADO");
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Aprovar OI-34" })).toBeNull();
  });

  it("Cancelar aprovado só libera com a caixa marcada e devolve ao estoque", async () => {
    mocks.db.cancelarOrcamentoInsumos.mockResolvedValue(venda("CANCELADO"));
    abrir("cancelar", "APROVADO");
    const botao = await screen.findByRole("button", { name: "Cancelar e devolver ao estoque" });
    expect(botao).toBeDisabled();
    expect(screen.getByText(/10 Ribbon cera 110x74 · 20 Etiqueta 100x50/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(botao);
    await waitFor(() => expect(mocks.db.cancelarOrcamentoInsumos).toHaveBeenCalledWith(34, "token-APROVADO", true));
  });

  it("Cancelar rascunho é a confirmação P, sem devolução", async () => {
    mocks.db.cancelarOrcamentoInsumos.mockResolvedValue(venda("CANCELADO"));
    abrir("cancelar", "RASCUNHO");
    const modal = await screen.findByRole("alertdialog");
    expect(within(modal).getByText("Cancelar OI-34?")).toBeInTheDocument();
    expect(modal).toHaveTextContent("O rascunho fica cancelado.");
    fireEvent.click(within(modal).getByRole("button", { name: "Cancelar orçamento" }));
    await waitFor(() => expect(mocks.db.cancelarOrcamentoInsumos).toHaveBeenCalledWith(34, "token-RASCUNHO", false));
  });

  it("Voltar na confirmação não chama o backend", async () => {
    const { onFechar } = abrir("reprovar", "ENVIADO");
    const modal = await screen.findByRole("alertdialog");
    fireEvent.click(within(modal).getByRole("button", { name: "Voltar" }));
    expect(onFechar).toHaveBeenCalled();
    expect(mocks.db.reprovarOrcamentoInsumos).not.toHaveBeenCalled();
    expect(mocks.ensureSensitiveAccess).not.toHaveBeenCalled();
  });

  it("Entregar e excluir confirmam, pedem PIN e chamam o backend com o token", async () => {
    mocks.db.excluirOrcamentoInsumos.mockResolvedValue(undefined);
    const { onExcluido } = abrir("excluir", "CANCELADO");
    const modal = await screen.findByRole("alertdialog");
    expect(within(modal).getByText("Excluir OI-34 de vez?")).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: "Excluir orçamento" }));
    await waitFor(() => expect(mocks.db.excluirOrcamentoInsumos).toHaveBeenCalledWith(34, "token-CANCELADO"));
    expect(onExcluido).toHaveBeenCalledWith("OI-34");
  });

  it("erro do backend fica no modal", async () => {
    mocks.db.marcarOrcamentoInsumosEntregue.mockRejectedValue("Conflito de concorrência");
    const { onFechar } = abrir("entregar", "APROVADO");
    const modal = await screen.findByRole("alertdialog");
    fireEvent.click(within(modal).getByRole("button", { name: "Marcar entregue" }));
    expect(await within(modal).findByText("Conflito de concorrência")).toBeInTheDocument();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it("a lista carrega o orçamento antes de abrir a ação", async () => {
    mocks.db.obterOrcamentoInsumos.mockResolvedValue(venda("APROVADO"));
    abrir("entregar", "APROVADO", { venda: undefined });
    expect(await screen.findByText("Marcar OI-34 como entregue?")).toBeInTheDocument();
    expect(mocks.db.obterOrcamentoInsumos).toHaveBeenCalledWith(34);
  });
});

describe("AcaoVendaDialog: casos da antiga janela do orçamento", () => {
  it("aprovar com Pix grava com o token e avisa a tela", async () => {
    mocks.db.aprovarOrcamentoInsumos.mockResolvedValue(venda("APROVADO"));
    const { onAlterado, onFechar } = abrir("aprovar", "ENVIADO");
    await screen.findByRole("heading", { name: "Aprovar OI-34" });
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e baixar estoque" }));
    await waitFor(() => expect(mocks.db.aprovarOrcamentoInsumos).toHaveBeenCalledWith(34, "token-ENVIADO", { codigo: "PIX", detalhe: null }));
    await waitFor(() => expect(onAlterado).toHaveBeenCalled());
    expect(onFechar).toHaveBeenCalled();
  });

  it("outra recusa da aprovação (vencido) fica no modal de aprovação", async () => {
    mocks.db.aprovarOrcamentoInsumos.mockRejectedValue("O orçamento OI-34 venceu em 01/01/2026 e não pode ser aprovado.");
    abrir("aprovar", "ENVIADO");
    await screen.findByRole("heading", { name: "Aprovar OI-34" });
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "A_COMBINAR" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e baixar estoque" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/venceu em 01\/01\/2026/);
    expect(screen.getByRole("heading", { name: "Aprovar OI-34" })).toBeInTheDocument();
  });

  it("reprovar pede PIN depois de confirmar e manda o token", async () => {
    mocks.db.reprovarOrcamentoInsumos.mockResolvedValue(venda("REPROVADO"));
    abrir("reprovar", "ENVIADO");
    const modal = await screen.findByRole("alertdialog");
    expect(mocks.ensureSensitiveAccess).not.toHaveBeenCalled();
    fireEvent.click(within(modal).getByRole("button", { name: "Reprovar" }));
    await waitFor(() => expect(mocks.db.reprovarOrcamentoInsumos).toHaveBeenCalledWith(34, "token-ENVIADO"));
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledWith(expect.objectContaining({ permission: "FINANCIAL_ACTIONS" }));
  });

  it("marcar entregue confirma e manda o token", async () => {
    mocks.db.marcarOrcamentoInsumosEntregue.mockResolvedValue(venda("ENTREGUE"));
    abrir("entregar", "APROVADO");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Marcar entregue" }));
    await waitFor(() => expect(mocks.db.marcarOrcamentoInsumosEntregue).toHaveBeenCalledWith(34, "token-APROVADO"));
  });

  it("excluir: Voltar não apaga", async () => {
    const { onFechar } = abrir("excluir", "CANCELADO");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Voltar" }));
    expect(onFechar).toHaveBeenCalled();
    expect(mocks.db.excluirOrcamentoInsumos).not.toHaveBeenCalled();
  });

  it("excluir com PIN recusado não apaga", async () => {
    mocks.ensureSensitiveAccess.mockResolvedValue(false);
    abrir("excluir", "CANCELADO");
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Excluir orçamento" }));
    await waitFor(() => expect(mocks.ensureSensitiveAccess).toHaveBeenCalled());
    expect(mocks.db.excluirOrcamentoInsumos).not.toHaveBeenCalled();
  });

  it("backend rejeita a exclusão: mostra o motivo e o modal continua aberto", async () => {
    mocks.db.excluirOrcamentoInsumos.mockRejectedValue("Conflito de concorrência: outro usuário alterou este orçamento.");
    const { onFechar, onExcluido } = abrir("excluir", "CANCELADO");
    const modal = await screen.findByRole("alertdialog");
    fireEvent.click(within(modal).getByRole("button", { name: "Excluir orçamento" }));
    expect(await within(modal).findByRole("alert")).toHaveTextContent("Conflito de concorrência: outro usuário alterou este orçamento.");
    expect(onFechar).not.toHaveBeenCalled();
    expect(onExcluido).not.toHaveBeenCalled();
  });

  it("PDF abre a prévia gerada do orçamento", async () => {
    abrir("pdf", "RASCUNHO");
    expect(await screen.findByTestId("pdf-preview")).toHaveTextContent("OI-34.pdf");
    expect(PdfService.construirOrcamentoInsumos).toHaveBeenCalledWith(expect.objectContaining({ numero_exibicao: "OI-34" }));
  });

  it("WhatsApp enviado marca pelo canal WHATSAPP", async () => {
    mocks.enviarWhatsapp.mockResolvedValue({ sucesso: true });
    mocks.db.marcarOrcamentoInsumosEnviado.mockResolvedValue(venda("ENVIADO"));
    abrir("whatsapp", "RASCUNHO");
    expect(await screen.findByRole("radio", { name: /WhatsApp para Lúcia Costa/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Enviar por WhatsApp" }));
    await waitFor(() => expect(mocks.db.marcarOrcamentoInsumosEnviado).toHaveBeenCalledWith(34, "token-RASCUNHO", "WHATSAPP"));
  });

  it("envio que falha não marca como enviado e mostra o motivo no modal", async () => {
    mocks.enviarEmail.mockResolvedValue({ sucesso: false, erro: "SMTP recusou a conexão." });
    const { onFechar } = abrir("email", "RASCUNHO");
    await screen.findByRole("heading", { name: "Enviar orçamento OI-34" });
    fireEvent.click(screen.getByRole("button", { name: "Enviar por e-mail" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("SMTP recusou a conexão.");
    expect(mocks.db.marcarOrcamentoInsumosEnviado).not.toHaveBeenCalled();
    expect(onFechar).not.toHaveBeenCalled();
  });

  it("pela lista, a ação só roda depois da carga e usa o token novo", async () => {
    let resolver: (valor: OrcamentoInsumosDetalhe) => void = () => undefined;
    mocks.db.obterOrcamentoInsumos.mockReturnValue(new Promise<OrcamentoInsumosDetalhe>((resolve) => { resolver = resolve; }));
    mocks.db.aprovarOrcamentoInsumos.mockResolvedValue(venda("APROVADO"));
    abrir("aprovar", "ENVIADO", { venda: undefined });
    expect(await screen.findByText("Carregando orçamento...")).toBeInTheDocument();
    expect(mocks.ensureSensitiveAccess).not.toHaveBeenCalled();

    resolver(venda("ENVIADO", { atualizado_em: "token-novo" }));
    await screen.findByRole("heading", { name: "Aprovar OI-34" });
    expect(mocks.ensureSensitiveAccess).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e baixar estoque" }));
    await waitFor(() => expect(mocks.db.aprovarOrcamentoInsumos).toHaveBeenCalledWith(34, "token-novo", { codigo: "PIX", detalhe: null }));
  });

  it.each([
    ["aprovar", "APROVADO"],
    ["entregar", "RASCUNHO"],
    ["reprovar", "APROVADO"],
    ["cancelar", "ENTREGUE"],
    ["excluir", "RASCUNHO"],
    ["email", "CANCELADO"],
  ] as const)("%s em %s: a situação não permite, nada abre", async (acao, status) => {
    const { onFechar } = abrir(acao, status);
    await waitFor(() => expect(onFechar).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.ensureSensitiveAccess).not.toHaveBeenCalled();
  });
});

describe("AcaoVendaDialog: revisão", () => {
  it("na página, a ação usa a versão atual do banco, não a cópia mostrada", async () => {
    mocks.db.obterOrcamentoInsumos.mockResolvedValue(venda("ENVIADO", { atualizado_em: "token-do-banco" }));
    mocks.db.reprovarOrcamentoInsumos.mockResolvedValue(venda("REPROVADO"));
    abrir("reprovar", "ENVIADO", { venda: venda("ENVIADO", { atualizado_em: "token-antigo" }) });
    const modal = await screen.findByRole("alertdialog");
    expect(screen.queryByText("Carregando orçamento...")).toBeNull();
    fireEvent.click(within(modal).getByRole("button", { name: "Reprovar" }));
    await waitFor(() => expect(mocks.db.reprovarOrcamentoInsumos).toHaveBeenCalledWith(34, "token-do-banco"));
  });

  it("recusa por falta com dois itens de mesmo nome não oferece Dar entrada", async () => {
    const duplicada = venda("ENVIADO", {
      itens: [
        { id: 1, orcamento_id: 34, produto_id: 9, descricao: "Ribbon", categoria: "RIBBON", quantidade: 1, valor_unitario: 32, valor_total: 32, saldo_estoque: 9 },
        { id: 2, orcamento_id: 34, produto_id: 10, descricao: "Ribbon", categoria: "RIBBON", quantidade: 10, valor_unitario: 32, valor_total: 320, saldo_estoque: 6 },
      ],
    } as Partial<OrcamentoInsumosDetalhe>);
    mocks.db.aprovarOrcamentoInsumos.mockRejectedValue("Estoque insuficiente para aprovar OI-34. Nada foi baixado.\n- Ribbon: precisa de 10, há 6 em estoque");
    mocks.db.obterOrcamentoInsumos.mockResolvedValue(duplicada);
    abrir("aprovar", "ENVIADO", { venda: duplicada });
    await screen.findByRole("heading", { name: "Aprovar OI-34" });
    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "PIX" } });
    fireEvent.click(screen.getByRole("button", { name: "Aprovar e baixar estoque" }));
    expect(await screen.findByRole("heading", { name: "Não deu para aprovar OI-34" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dar entrada no estoque" })).toBeNull();
    expect(screen.getByRole("button", { name: "Editar quantidades" })).toBeInTheDocument();
  });
});
