import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DecisaoOrcamentoCard } from "@/components/equipamentos/DecisaoOrcamentoCard";
import type { DecisaoOrcamentoInfo, Equipamento } from "@/types";

const mocks = vi.hoisted(() => ({
  obter: vi.fn(),
  ensure: vi.fn(),
  publicar: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    obterDecisaoOrcamento: mocks.obter,
    publicarOrcamentoPortal: mocks.publicar,
  },
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensure }),
}));

const equipamento = { id: 7, status: "AGUARDANDO_APROVACAO", atualizado_em: "t1" } as Equipamento;

function info(overrides: Partial<DecisaoOrcamentoInfo> = {}): DecisaoOrcamentoInfo {
  return {
    versaoId: 1,
    versao: 1,
    valorTotal: 250,
    criadaEm: "2026-10-14T12:00:00Z",
    aceiteOnlineAtivo: true,
    historico: [],
    solicitacoes: [],
    podeAplicar: false,
    ...overrides,
  };
}

const respostaPortal = {
  id: 9,
  origem: "PORTAL" as const,
  decisao: "APROVAR" as const,
  registradaEm: "2026-10-14T14:32:00Z",
};

describe("DecisaoOrcamentoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(true);
  });

  it("mostra a resposta aguardando conferência e só libera a aplicação depois da janela", async () => {
    const onRespostaVista = vi.fn();
    const onAplicar = vi.fn();
    mocks.obter.mockResolvedValue(info({
      resposta: respostaPortal,
      historico: [respostaPortal],
      aplicavelAPartirDe: "2026-10-14T14:47:00Z",
      podeAplicar: false,
    }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={onRespostaVista} onAplicar={onAplicar} />);

    expect(await screen.findByText(/Cliente respondeu: aprovou — aguardando conferência/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revisar e aplicar decisão/i })).toBeDisabled();
    expect(onRespostaVista).toHaveBeenLastCalledWith(9);
  });

  it("aplica com a decisão do cliente quando a janela terminou", async () => {
    const onAplicar = vi.fn();
    mocks.obter.mockResolvedValue(info({ resposta: respostaPortal, historico: [respostaPortal], podeAplicar: true }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={onAplicar} />);

    const botao = await screen.findByRole("button", { name: /revisar e aplicar decisão/i });
    fireEvent.click(botao);
    expect(onAplicar).toHaveBeenCalledWith("aprovar");
  });

  it("não reporta resposta quando a versão foi encerrada por edição do orçamento", async () => {
    const onRespostaVista = vi.fn();
    mocks.obter.mockResolvedValue(info({
      encerradaMotivo: "ORCAMENTO_ALTERADO",
      resposta: respostaPortal,
      historico: [respostaPortal],
    }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={onRespostaVista} onAplicar={vi.fn()} />);

    await waitFor(() => expect(onRespostaVista).toHaveBeenCalledWith(0));
    expect(screen.queryByRole("button", { name: /revisar e aplicar decisão/i })).not.toBeInTheDocument();
  });

  it("sem orçamento publicado mostra só o botão de publicar, sem quadro nem registro por telefone", async () => {
    mocks.obter.mockResolvedValue(null);
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Publicar no Portal do Cliente" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.obter).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Resposta do cliente ao orçamento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cliente aprovou|cliente recusou/i })).not.toBeInTheDocument();
  });

  it("fora de AGUARDANDO_APROVACAO e sem orçamento publicado não mostra nada", async () => {
    mocks.obter.mockResolvedValue(null);
    const { container } = render(
      <DecisaoOrcamentoCard equipamento={{ ...equipamento, status: "EM_MANUTENCAO" }} onRespostaVista={vi.fn()} onAplicar={vi.fn()} />,
    );
    await waitFor(() => expect(mocks.obter).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("publicado e sem resposta fica neutro; resposta pendente fica em destaque", async () => {
    mocks.obter.mockResolvedValue(info());
    const { unmount } = render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={vi.fn()} />);
    expect(await screen.findByText("Orçamento no portal")).toBeInTheDocument();
    expect(screen.getByText("Aguardando resposta do cliente.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resposta do cliente ao orçamento" }).className).not.toContain("amber");
    unmount();

    mocks.obter.mockResolvedValue(info({ resposta: respostaPortal, historico: [respostaPortal] }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={vi.fn()} />);
    expect(await screen.findByText("Resposta do cliente ao orçamento")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resposta do cliente ao orçamento" }).className).toContain("amber");
    // Publicar de novo anularia a resposta pendente.
    expect(screen.queryByRole("button", { name: "Publicar no Portal do Cliente" })).not.toBeInTheDocument();
  });

  it("não oferece mais link de decisão nem envio de link por WhatsApp", async () => {
    mocks.obter.mockResolvedValue(info());
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={vi.fn()} />);
    expect(await screen.findByText("Orçamento no portal")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /whatsapp/i })).not.toBeInTheDocument();
  });

  it("avisa quando as respostas pelo portal estão desligadas", async () => {
    mocks.obter.mockResolvedValue(info({ aceiteOnlineAtivo: false }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={vi.fn()} />);
    expect(await screen.findByText(/respostas pelo Portal do Cliente estão desligadas/)).toBeInTheDocument();
  });

  it("resposta do Portal do Cliente em prazo de correção não pode ser aplicada", async () => {
    const resposta = {
      id: 12, origem: "PORTAL_CLIENTE" as const, decisao: "APROVAR" as const,
      registradaEm: new Date().toISOString(), contato: "Ana Souza",
    };
    mocks.obter.mockResolvedValue(info({
      resposta, historico: [resposta], efetivacaoAutomatica: true,
      aplicavelAPartirDe: new Date(Date.now() + 10 * 60_000).toISOString(),
    }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={vi.fn()} />);
    expect(await screen.findByText(/resposta recebida, em prazo de correção/)).toBeInTheDocument();
    expect(screen.getByText(/Não inicie o serviço/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar e aplicar decisão" })).not.toBeInTheDocument();
  });

  it("falha na efetivação automática mostra o motivo e libera a aplicação manual", async () => {
    const onAplicar = vi.fn();
    const resposta = {
      id: 12, origem: "PORTAL_CLIENTE" as const, decisao: "RECUSAR" as const,
      registradaEm: "2026-10-14T14:00:00Z", contato: "Ana Souza",
      efetivacaoErro: "PECAS_SEM_SERVICO", efetivacaoFalhouEm: "2026-10-14T14:16:00Z",
    };
    mocks.obter.mockResolvedValue(info({
      resposta, historico: [resposta], podeAplicar: true,
      aplicavelAPartirDe: "2026-10-14T14:15:00Z",
    }));
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={onAplicar} />);
    expect(await screen.findByText(/efetivação NÃO concluída/)).toBeInTheDocument();
    expect(screen.getAllByText(/peças antigas sem serviço vinculado/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Revisar e aplicar decisão" }));
    expect(onAplicar).toHaveBeenCalledWith("reprovar");
  });

  it("publica o orçamento no portal", async () => {
    mocks.obter.mockResolvedValue(info());
    mocks.publicar.mockResolvedValue({ versaoId: 2, versao: 2, nova: true });
    render(<DecisaoOrcamentoCard equipamento={equipamento} onRespostaVista={vi.fn()} onAplicar={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Publicar no Portal do Cliente" }));
    await waitFor(() => expect(mocks.publicar).toHaveBeenCalledWith(7));
  });
});
