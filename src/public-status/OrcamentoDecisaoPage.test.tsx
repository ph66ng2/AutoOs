import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrcamentoDecisaoPage from "./OrcamentoDecisaoPage";
import {
  consultarOrcamento,
  OrcamentoRequestError,
  responderOrcamento,
  solicitarContatoOrcamento,
  type OrcamentoPublico,
} from "./orcamento-api";

vi.mock("./orcamento-api", () => ({
  consultarOrcamento: vi.fn(),
  responderOrcamento: vi.fn(),
  solicitarContatoOrcamento: vi.fn(),
  OrcamentoRequestError: class OrcamentoRequestError extends Error {
    constructor(public readonly kind: string) {
      super(kind);
    }
  },
}));

const token = "e".repeat(64);

function orcamento(overrides: Partial<OrcamentoPublico> = {}): OrcamentoPublico {
  return {
    estado: "ABERTO",
    versao: 1,
    equipamento: "Impressora Zebra ZT230",
    valorTotal: 250,
    validoAte: null,
    servicos: [{ descricao: "Troca da cabeça", valor: 250, pecas: [{ nome: "Cabeça", quantidade: 1, valorUnitario: 100 }] }],
    pecas: [],
    janelaMinutos: 15,
    resposta: null,
    ...overrides,
  };
}

const respostaAprovada = {
  id: 4,
  decisao: "APROVAR" as const,
  registradaEm: "2026-10-14T14:32:00Z",
  janelaAte: "2026-10-14T14:47:00Z",
  aplicada: false,
};

beforeEach(() => {
  vi.mocked(consultarOrcamento).mockReset();
  vi.mocked(responderOrcamento).mockReset();
  vi.mocked(solicitarContatoOrcamento).mockReset();
  window.location.hash = `#/o/${token}`;
});

describe("OrcamentoDecisaoPage", () => {
  it("mostra o orçamento e não decide nada ao tocar em aprovar", async () => {
    vi.mocked(consultarOrcamento).mockResolvedValue(orcamento());
    render(<OrcamentoDecisaoPage />);

    fireEvent.click(await screen.findByRole("button", { name: /aprovar este orçamento de/i }));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(/Confirmar a aprovação de/);
    expect(responderOrcamento).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Voltar" }));
    expect(responderOrcamento).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /aprovar este orçamento de/i })).toBeInTheDocument();
  });

  it("envia a decisão só após a confirmação, com a resposta vigente vista", async () => {
    vi.mocked(consultarOrcamento)
      .mockResolvedValueOnce(orcamento())
      .mockResolvedValueOnce(orcamento({ resposta: respostaAprovada }));
    vi.mocked(responderOrcamento).mockResolvedValue({
      respostaId: 4, decisao: "APROVAR", registradaEm: respostaAprovada.registradaEm, janelaAte: respostaAprovada.janelaAte, repetida: false,
    });
    render(<OrcamentoDecisaoPage />);

    fireEvent.click(await screen.findByRole("button", { name: /aprovar este orçamento de/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aprovação" }));

    await waitFor(() => expect(responderOrcamento).toHaveBeenCalledWith(token, "APROVAR", 0));
    expect(await screen.findByText(/Resposta recebida às/)).toBeInTheDocument();
    expect(screen.getByText(/A equipe ainda não iniciou o serviço/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer resposta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /alterar para: não aprovar/i })).toBeInTheDocument();
  });

  it("desfaz enviando o id da resposta que o cliente via", async () => {
    vi.mocked(consultarOrcamento).mockResolvedValue(orcamento({ resposta: respostaAprovada }));
    vi.mocked(responderOrcamento).mockResolvedValue({
      respostaId: 5, decisao: "DESFEITA", registradaEm: "2026-10-14T14:40:00Z", janelaAte: "2026-10-14T14:55:00Z", repetida: false,
    });
    render(<OrcamentoDecisaoPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Desfazer resposta" }));
    await waitFor(() => expect(responderOrcamento).toHaveBeenCalledWith(token, "DESFEITA", 4));
  });

  it("recarrega e avisa quando outra resposta chegou antes (tela desatualizada)", async () => {
    vi.mocked(consultarOrcamento)
      .mockResolvedValueOnce(orcamento())
      .mockResolvedValueOnce(orcamento({ resposta: { ...respostaAprovada, id: 9 } }));
    vi.mocked(responderOrcamento).mockRejectedValue(new OrcamentoRequestError("outdated"));
    render(<OrcamentoDecisaoPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Não aprovar" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar: não aprovar" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/A resposta mudou/);
    expect(await screen.findByText(/Resposta recebida às/)).toBeInTheDocument();
    expect(consultarOrcamento).toHaveBeenCalledTimes(2);
  });

  it("envia uma dúvida sem registrar decisão", async () => {
    vi.mocked(consultarOrcamento).mockResolvedValue(orcamento());
    vi.mocked(solicitarContatoOrcamento).mockResolvedValue({ recebidaEm: "2026-10-14T15:00:00Z" });
    render(<OrcamentoDecisaoPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Tenho uma dúvida" }));
    fireEvent.change(screen.getByLabelText("Qual é a sua dúvida?"), { target: { value: "Inclui frete?" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar dúvida" }));

    await waitFor(() => expect(solicitarContatoOrcamento).toHaveBeenCalledWith(token, "DUVIDA", "Inclui frete?"));
    expect(await screen.findByText(/Mensagem enviada/)).toBeInTheDocument();
    expect(responderOrcamento).not.toHaveBeenCalled();
  });

  it("depois que a equipe aplicou, oferece Pedir mudança sem prometer cancelamento", async () => {
    vi.mocked(consultarOrcamento).mockResolvedValue(orcamento({
      estado: "APLICADO",
      resposta: { ...respostaAprovada, aplicada: true },
    }));
    vi.mocked(solicitarContatoOrcamento).mockResolvedValue({ recebidaEm: "2026-10-14T16:00:00Z" });
    render(<OrcamentoDecisaoPage />);

    expect(await screen.findByText("A equipe já registrou sua decisão")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aprovar este orçamento/i })).not.toBeInTheDocument();
    expect(screen.getByText(/cancelamento não é automático/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pedir mudança" }));
    fireEvent.change(screen.getByLabelText("O que você gostaria de mudar?"), { target: { value: "Cancelar o serviço" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar pedido" }));
    await waitFor(() => expect(solicitarContatoOrcamento).toHaveBeenCalledWith(token, "MUDANCA", "Cancelar o serviço"));
  });

  it("mostra a mesma mensagem para link inválido, vencido ou pausado", async () => {
    vi.mocked(consultarOrcamento).mockRejectedValue(new OrcamentoRequestError("unavailable"));
    render(<OrcamentoDecisaoPage />);

    expect(await screen.findByRole("heading", { name: "Este orçamento não está disponível" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /tentar novamente/i })).not.toBeInTheDocument();
  });
});
