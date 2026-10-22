import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DecisaoOrcamentoCard } from "@/components/equipamentos/DecisaoOrcamentoCard";
import { PortalClienteBotao } from "@/components/equipamentos/PortalClienteBotao";
import { PortalClienteProvider } from "@/components/equipamentos/portal-cliente-context";
import type { DecisaoOrcamentoInfo, Equipamento, SolicitacaoOrcamentoInfo } from "@/types";

const mocks = vi.hoisted(() => ({
  obter: vi.fn(),
  ensure: vi.fn(),
  publicar: vi.fn(),
  contatos: vi.fn(),
  tratar: vi.fn(),
  abrirUrl: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    obterDecisaoOrcamento: mocks.obter,
    publicarOrcamentoPortal: mocks.publicar,
    listarClienteContatos: mocks.contatos,
    marcarSolicitacaoOrcamentoTratada: mocks.tratar,
    abrirUrl: mocks.abrirUrl,
    buscarCliente: vi.fn(),
  },
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensure }),
}));

const equipamento = { id: 7, status: "AGUARDANDO_APROVACAO", atualizado_em: "t1", marca: "HP", modelo: "M404" } as Equipamento;

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

function solicitacao(overrides: Partial<SolicitacaoOrcamentoInfo> = {}): SolicitacaoOrcamentoInfo {
  return {
    id: 31,
    tipo: "NEGOCIAR",
    mensagem: "Consegue fazer por 200?",
    criadaEm: "2026-10-15T10:00:00Z",
    contato: "Ana Souza",
    ...overrides,
  };
}

function renderCard(eq: Equipamento = equipamento, onAplicar = vi.fn()) {
  return render(
    <PortalClienteProvider equipamento={eq}>
      <PortalClienteBotao />
      <DecisaoOrcamentoCard onAplicar={onAplicar} />
    </PortalClienteProvider>,
  );
}

describe("DecisaoOrcamentoCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(true);
    mocks.contatos.mockResolvedValue([]);
    mocks.abrirUrl.mockResolvedValue(undefined);
  });

  it("mostra a resposta aguardando conferência e só libera a aplicação depois da janela", async () => {
    mocks.obter.mockResolvedValue(info({
      resposta: respostaPortal,
      historico: [respostaPortal],
      aplicavelAPartirDe: "2026-10-14T14:47:00Z",
      podeAplicar: false,
    }));
    renderCard();

    expect(await screen.findByText(/Cliente aprovou: aguardando conferência/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revisar e aplicar decisão/i })).toBeDisabled();
    expect(screen.getByRole("region", { name: "Resposta do cliente ao orçamento" }).dataset.tom).toBe("ambar");
  });

  it("aplica com a decisão do cliente quando a janela terminou", async () => {
    const onAplicar = vi.fn();
    mocks.obter.mockResolvedValue(info({ resposta: respostaPortal, historico: [respostaPortal], podeAplicar: true }));
    renderCard(equipamento, onAplicar);

    fireEvent.click(await screen.findByRole("button", { name: /revisar e aplicar decisão/i }));
    expect(onAplicar).toHaveBeenCalledWith("aprovar");
  });

  it("versão encerrada por edição do orçamento não oferece aplicar a resposta antiga e sugere publicar de novo", async () => {
    mocks.obter.mockResolvedValue(info({
      encerradaMotivo: "ORCAMENTO_ALTERADO",
      resposta: respostaPortal,
      historico: [respostaPortal],
    }));
    renderCard();

    expect(await screen.findByText(/Versão 1 encerrada/)).toBeInTheDocument();
    expect(screen.getByText(/Publique de novo/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /revisar e aplicar decisão/i })).not.toBeInTheDocument();
  });

  it("em APROVADO não pede nova versão: mostra só o registro do que o cliente aprovou, com a OC", async () => {
    const resposta = {
      id: 12, origem: "PORTAL_CLIENTE" as const, decisao: "APROVAR" as const,
      registradaEm: "2026-10-14T14:32:00Z", contato: "Ana Souza", aplicadaEm: "2026-10-14T14:50:00Z",
      aplicadaPeloSistema: true, ordemCompra: "OC-778",
    };
    mocks.obter.mockResolvedValue(info({ encerradaMotivo: "APROVADO", resposta, historico: [resposta] }));
    renderCard({ ...equipamento, status: "APROVADO" });

    expect(await screen.findByText(/Cliente aprovou pelo portal/)).toBeInTheDocument();
    expect(screen.getByText("OC nº OC-778")).toBeInTheDocument();
    expect(screen.queryByText(/publique|envie uma nova versão/i)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resposta do cliente ao orçamento" }).dataset.tom).toBe("verde");
  });

  it("sem orçamento publicado mostra a faixa com o botão de publicar", async () => {
    mocks.obter.mockResolvedValue(null);
    renderCard();
    expect(await screen.findByRole("button", { name: "Publicar no Portal do Cliente" })).toBeInTheDocument();
    expect(screen.getByText(/ainda não publicado/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cliente aprovou|cliente recusou/i })).not.toBeInTheDocument();
  });

  it("fora de AGUARDANDO_APROVACAO e sem orçamento publicado não mostra nada", async () => {
    mocks.obter.mockResolvedValue(null);
    renderCard({ ...equipamento, status: "EM_MANUTENCAO" });
    await waitFor(() => expect(mocks.obter).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Resposta do cliente ao orçamento" })).not.toBeInTheDocument();
  });

  it("publicado e sem resposta fica neutro e compacto; resposta pendente fica em destaque", async () => {
    mocks.obter.mockResolvedValue(info());
    const { unmount } = renderCard();
    expect(await screen.findByText("Aguardando resposta do cliente")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resposta do cliente ao orçamento" }).dataset.tom).toBe("neutro");
    expect(screen.getByText(/Versão 1 · /)).toBeInTheDocument();
    unmount();

    mocks.obter.mockResolvedValue(info({ resposta: respostaPortal, historico: [respostaPortal] }));
    renderCard();
    expect(await screen.findByText(/Cliente aprovou: aguardando conferência/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resposta do cliente ao orçamento" }).dataset.tom).toBe("ambar");
    // Publicar de novo anularia a resposta pendente.
    expect(screen.queryByRole("button", { name: "Publicar no Portal do Cliente" })).not.toBeInTheDocument();
  });

  it("avisa na faixa quando as respostas pelo portal estão desligadas", async () => {
    mocks.obter.mockResolvedValue(info({ aceiteOnlineAtivo: false }));
    renderCard();
    expect(await screen.findByText(/respostas pelo portal desligadas/)).toBeInTheDocument();
  });

  it("aceite do portal em prazo de correção: verde, diz a hora de aplicar e não oferece aplicar", async () => {
    const resposta = {
      id: 12, origem: "PORTAL_CLIENTE" as const, decisao: "APROVAR" as const,
      registradaEm: new Date().toISOString(), contato: "Ana Souza", ordemCompra: "4500123",
    };
    mocks.obter.mockResolvedValue(info({
      resposta, historico: [resposta], efetivacaoAutomatica: true,
      aplicavelAPartirDe: new Date(Date.now() + 10 * 60_000).toISOString(),
    }));
    renderCard();
    expect(await screen.findByText(/Cliente aprovou: aplica às/)).toBeInTheDocument();
    expect(screen.getByText(/não inicie o serviço/)).toBeInTheDocument();
    expect(screen.getByText("OC nº 4500123")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resposta do cliente ao orçamento" }).dataset.tom).toBe("verde");
    expect(screen.queryByRole("button", { name: "Revisar e aplicar decisão" })).not.toBeInTheDocument();
  });

  it("recusa do cliente fica vermelha", async () => {
    const resposta = {
      id: 13, origem: "PORTAL_CLIENTE" as const, decisao: "RECUSAR" as const,
      registradaEm: new Date().toISOString(), contato: "Ana Souza",
    };
    mocks.obter.mockResolvedValue(info({
      resposta, historico: [resposta],
      aplicavelAPartirDe: new Date(Date.now() + 10 * 60_000).toISOString(),
    }));
    renderCard();
    expect(await screen.findByText(/Cliente recusou: aplica às/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resposta do cliente ao orçamento" }).dataset.tom).toBe("vermelho");
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
    renderCard(equipamento, onAplicar);
    expect(await screen.findByText(/efetivação não foi concluída/)).toBeInTheDocument();
    expect(screen.getByText(/peças antigas sem serviço vinculado/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Revisar e aplicar decisão" }));
    expect(onAplicar).toHaveBeenCalledWith("reprovar");
  });

  it("publica o orçamento no portal pela faixa quando ainda não foi publicado", async () => {
    mocks.obter.mockResolvedValue(null);
    mocks.publicar.mockResolvedValue({ versaoId: 2, versao: 2, nova: true });
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Publicar no Portal do Cliente" }));
    await waitFor(() => expect(mocks.publicar).toHaveBeenCalledWith(7));
    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ anyPermission: ["MANAGE_STATUS_LINKS", "PREPARE_QUOTES"] }));
  });

  it("troca rápida de equipamento: resposta atrasada do anterior não sobrescreve o quadro", async () => {
    let liberarAntigo: (valor: DecisaoOrcamentoInfo) => void = () => {};
    mocks.obter.mockImplementationOnce(() => new Promise((resolve) => { liberarAntigo = resolve; }));
    mocks.obter.mockResolvedValueOnce(info({ resposta: respostaPortal, historico: [respostaPortal], podeAplicar: true }));
    const { rerender } = renderCard();
    rerender(
      <PortalClienteProvider equipamento={{ ...equipamento, id: 8 }}>
        <DecisaoOrcamentoCard onAplicar={vi.fn()} />
      </PortalClienteProvider>,
    );
    const botao = await screen.findByRole("button", { name: /revisar e aplicar decisão/i });
    await act(async () => { liberarAntigo(info()); });
    expect(botao).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revisar e aplicar decisão/i })).toBeEnabled();
  });

  describe("negociação e pedidos de ajuste", () => {
    it("NEGOCIAR em aberto aparece em violeta com a mensagem, o contato informado e os botões", async () => {
      mocks.obter.mockResolvedValue(info({
        solicitacoes: [solicitacao({ contatoTelefone: "(71) 98888-7777", contatoEmail: "ana@cliente.com" })],
      }));
      renderCard();

      const pedido = await screen.findByRole("group", { name: "Pedido do cliente" });
      expect(within(pedido).getByText("Pedido de negociação")).toBeInTheDocument();
      expect(within(pedido).getByText("Consegue fazer por 200?")).toBeInTheDocument();
      expect(within(pedido).getByText(/\(71\) 98888-7777 · ana@cliente.com/)).toBeInTheDocument();
      expect(pedido.className).toContain("violet");
      expect(within(pedido).getByRole("button", { name: /WhatsApp/ })).toBeInTheDocument();
      expect(within(pedido).getByRole("button", { name: /E-mail/ })).toBeInTheDocument();
    });

    it("WhatsApp abre o wa.me com o telefone da solicitação e mensagem citando o equipamento e o protocolo", async () => {
      mocks.obter.mockResolvedValue(info({ solicitacoes: [solicitacao({ contatoTelefone: "(71) 98888-7777" })] }));
      renderCard({ ...equipamento, cliente_telefone: "11 90000-0000" });

      fireEvent.click(await screen.findByRole("button", { name: /WhatsApp/ }));
      await waitFor(() => expect(mocks.abrirUrl).toHaveBeenCalledTimes(1));
      const url = new URL(mocks.abrirUrl.mock.calls[0][0]);
      expect(url.origin + url.pathname).toBe("https://wa.me/5571988887777");
      const texto = url.searchParams.get("text")!;
      expect(texto).toContain("HP M404");
      expect(texto).toContain("S-31");
      expect(texto).toContain("Ana");
    });

    it("sem telefone na solicitação usa o do contato responsável ou do cadastro", async () => {
      mocks.obter.mockResolvedValue(info({ solicitacoes: [solicitacao()] }));
      renderCard({ ...equipamento, responsavel_telefone: "(21) 97777-6666", cliente_email: "contato@empresa.com" });

      fireEvent.click(await screen.findByRole("button", { name: /WhatsApp/ }));
      await waitFor(() => expect(mocks.abrirUrl).toHaveBeenCalled());
      expect(mocks.abrirUrl.mock.calls[0][0]).toContain("https://wa.me/5521977776666?text=");
      expect(screen.getByText("Contato do cadastro do cliente.")).toBeInTheDocument();
    });

    it("E-mail abre um mailto com o e-mail informado pelo cliente", async () => {
      mocks.obter.mockResolvedValue(info({ solicitacoes: [solicitacao({ contatoEmail: "ana@cliente.com" })] }));
      renderCard();

      fireEvent.click(await screen.findByRole("button", { name: /E-mail/ }));
      await waitFor(() => expect(mocks.abrirUrl).toHaveBeenCalled());
      const url = mocks.abrirUrl.mock.calls[0][0] as string;
      expect(url.startsWith("mailto:ana@cliente.com?subject=")).toBe(true);
      expect(decodeURIComponent(url)).toContain("S-31");
      expect(screen.queryByRole("button", { name: /WhatsApp/ })).not.toBeInTheDocument();
    });

    it("sem telefone nem e-mail avisa e oferece gerenciar contatos", async () => {
      mocks.obter.mockResolvedValue(info({ solicitacoes: [solicitacao()] }));
      renderCard({ ...equipamento, cliente_id: 2, empresa_id: 1 });

      expect(await screen.findByText("O cliente não deixou telefone nem e-mail.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /WhatsApp/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /E-mail/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Gerenciar contatos/ })).toBeInTheDocument();
    });

    it("pedido de ajuste (MUDANCA) fica âmbar e a mensagem longa tem 'ver mais'", async () => {
      const longa = "Preciso de uma mudança no orçamento. ".repeat(10);
      mocks.obter.mockResolvedValue(info({ solicitacoes: [solicitacao({ tipo: "MUDANCA", mensagem: longa })] }));
      renderCard();

      const pedido = await screen.findByRole("group", { name: "Pedido do cliente" });
      expect(within(pedido).getByText("Pedido de ajuste")).toBeInTheDocument();
      expect(pedido.className).toContain("amber");
      const ver = within(pedido).getByRole("button", { name: "ver mais" });
      expect(pedido.querySelector("p.line-clamp-2")).not.toBeNull();
      fireEvent.click(ver);
      expect(within(pedido).getByRole("button", { name: "ver menos" })).toBeInTheDocument();
      expect(pedido.querySelector("p.line-clamp-2")).toBeNull();
    });

    it("marcar como tratada pede o acesso e chama o comando; pedido tratado não aparece mais em destaque", async () => {
      mocks.obter.mockResolvedValueOnce(info({ solicitacoes: [solicitacao()] }));
      mocks.obter.mockResolvedValue(info({ solicitacoes: [solicitacao({ tratadaEm: "2026-10-15T11:00:00Z" })] }));
      mocks.tratar.mockResolvedValue(true);
      renderCard();

      fireEvent.click(await screen.findByRole("button", { name: "Marcar como tratada" }));
      await waitFor(() => expect(mocks.tratar).toHaveBeenCalledWith(31));
      await waitFor(() => expect(screen.queryByRole("group", { name: "Pedido do cliente" })).not.toBeInTheDocument());
    });

    it("com mais de um pedido em aberto mostra o mais recente e o contador dos demais", async () => {
      mocks.obter.mockResolvedValue(info({
        solicitacoes: [solicitacao({ id: 33, mensagem: "Terceiro" }), solicitacao({ id: 32, tipo: "DUVIDA", mensagem: "Segundo" }), solicitacao()],
      }));
      renderCard();
      expect(await screen.findByText("Terceiro")).toBeInTheDocument();
      expect(screen.queryByText("Segundo")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+2 pedidos" })).toBeInTheDocument();
    });

    it("destaca a negociação em aberto mesmo havendo uma dúvida mais nova", async () => {
      mocks.obter.mockResolvedValue(info({
        solicitacoes: [
          solicitacao({ id: 40, tipo: "DUVIDA", mensagem: "Qual o prazo?", criadaEm: "2026-10-16T10:00:00Z" }),
          solicitacao({ id: 38, tipo: "MUDANCA", mensagem: "Trocar o item", criadaEm: "2026-10-15T12:00:00Z" }),
          solicitacao({ id: 30, tipo: "NEGOCIAR", mensagem: "Faz por 200?", criadaEm: "2026-10-14T10:00:00Z" }),
          solicitacao({ id: 35, tipo: "NEGOCIAR", mensagem: "Faz por 250?", criadaEm: "2026-10-12T10:00:00Z" }),
        ],
      }));
      renderCard();
      expect(await screen.findByText("Faz por 200?")).toBeInTheDocument();
      expect(screen.queryByText("Qual o prazo?")).not.toBeInTheDocument();
      expect(screen.getByText("Pedido de negociação")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "+3 pedidos" })).toBeInTheDocument();
    });

    it("sem negociação, o ajuste vem antes da dúvida mais nova", async () => {
      mocks.obter.mockResolvedValue(info({
        solicitacoes: [
          solicitacao({ id: 40, tipo: "DUVIDA", mensagem: "Qual o prazo?", criadaEm: "2026-10-16T10:00:00Z" }),
          solicitacao({ id: 38, tipo: "MUDANCA", mensagem: "Trocar o item", criadaEm: "2026-10-15T12:00:00Z" }),
        ],
      }));
      renderCard();
      expect(await screen.findByText("Trocar o item")).toBeInTheDocument();
      expect(screen.queryByText("Qual o prazo?")).not.toBeInTheDocument();
    });
  });

  describe("botão Portal do Cliente", () => {
    it("sem pendências não mostra indicador", async () => {
      mocks.obter.mockResolvedValue(info());
      renderCard();
      await screen.findByText("Aguardando resposta do cliente");
      expect(screen.getByRole("button", { name: "Portal do Cliente" })).toBeInTheDocument();
      expect(screen.queryByTestId("portal-pendencias")).not.toBeInTheDocument();
    });

    it("conta resposta pendente e mensagens não tratadas", async () => {
      mocks.obter.mockResolvedValue(info({
        resposta: respostaPortal,
        historico: [respostaPortal],
        solicitacoes: [solicitacao(), solicitacao({ id: 32, tratadaEm: "2026-10-15T11:00:00Z" })],
      }));
      renderCard();
      expect(await screen.findByTestId("portal-pendencias")).toHaveTextContent("2");
      expect(screen.getByRole("button", { name: "Portal do Cliente, 2 pendências" })).toBeInTheDocument();
    });
  });
});
