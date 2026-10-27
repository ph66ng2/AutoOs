import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PortalClienteBotao } from "@/components/equipamentos/PortalClienteBotao";
import { PortalClienteProvider } from "@/components/equipamentos/portal-cliente-context";
import type { DecisaoOrcamentoInfo, Equipamento } from "@/types";

const mocks = vi.hoisted(() => ({
  obter: vi.fn(),
  ensure: vi.fn(),
  publicar: vi.fn(),
  contatos: vi.fn(),
  tratar: vi.fn(),
  linkInfo: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    obterDecisaoOrcamento: mocks.obter,
    publicarOrcamentoPortal: mocks.publicar,
    listarClienteContatos: mocks.contatos,
    marcarSolicitacaoOrcamentoTratada: mocks.tratar,
    buscarCliente: vi.fn().mockResolvedValue(null),
    abrirUrl: vi.fn(),
  },
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({
  useSensitiveAccess: () => ({ ensureSensitiveAccess: mocks.ensure }),
}));
// O diálogo do link tem testes próprios; aqui só importa que o painel o abre com o acesso liberado.
vi.mock("@/components/equipamentos/PublicStatusLinkDialog", () => ({
  PublicStatusLinkDialog: ({ open }: { open: boolean }) => (open ? <p>Diálogo do link sem login aberto</p> : null),
}));

const equipamento = {
  id: 7, status: "AGUARDANDO_APROVACAO", atualizado_em: "t1", marca: "HP", modelo: "M404", cliente_id: 2, empresa_id: 1,
} as Equipamento;

function info(overrides: Partial<DecisaoOrcamentoInfo> = {}): DecisaoOrcamentoInfo {
  return {
    versaoId: 1, versao: 3, valorTotal: 250, criadaEm: "2026-10-14T12:00:00Z", validoAte: "2026-10-30T12:00:00Z",
    aceiteOnlineAtivo: true, historico: [], solicitacoes: [], podeAplicar: false,
    ...overrides,
  };
}

async function abrirPainel(eq: Equipamento = equipamento) {
  render(
    <PortalClienteProvider equipamento={eq}>
      <PortalClienteBotao />
    </PortalClienteProvider>,
  );
  await waitFor(() => expect(mocks.obter).toHaveBeenCalled());
  fireEvent.click(await screen.findByRole("button", { name: /^Portal do Cliente/ }));
  return await screen.findByRole("dialog");
}

describe("PortalClientePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(true);
    mocks.contatos.mockResolvedValue([]);
  });

  it("mostra a situação da publicação: versão, data e validade", async () => {
    mocks.obter.mockResolvedValue(info());
    const painel = await abrirPainel();
    expect(within(painel).getByText(/Versão 3 enviada em/)).toBeInTheDocument();
    expect(within(painel).getByText(/válida até/)).toBeInTheDocument();
  });

  it("publica o orçamento mantendo a exigência de acesso e avisa quando as respostas estão desligadas", async () => {
    mocks.obter.mockResolvedValue(info({ aceiteOnlineAtivo: false }));
    mocks.publicar.mockResolvedValue({ versaoId: 2, versao: 4, nova: true });
    const painel = await abrirPainel();
    expect(within(painel).getByText(/respostas pelo Portal do Cliente estão desligadas/)).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Publicar no Portal do Cliente" }));
    await waitFor(() => expect(mocks.publicar).toHaveBeenCalledWith(7));
    expect(mocks.ensure).toHaveBeenCalledWith(expect.objectContaining({ anyPermission: ["MANAGE_STATUS_LINKS", "PREPARE_QUOTES"] }));
  });

  it("com resposta pendente não oferece publicar (anularia a resposta)", async () => {
    const resposta = { id: 9, origem: "PORTAL_CLIENTE" as const, decisao: "APROVAR" as const, registradaEm: "2026-10-14T14:32:00Z" };
    mocks.obter.mockResolvedValue(info({ resposta, historico: [resposta] }));
    const painel = await abrirPainel();
    expect(within(painel).queryByRole("button", { name: "Publicar no Portal do Cliente" })).not.toBeInTheDocument();
    expect(within(painel).getByText(/anularia essa resposta/)).toBeInTheDocument();
  });

  it("lista quem responde e oferece dar acesso quando ninguém pode", async () => {
    mocks.obter.mockResolvedValue(info());
    mocks.contatos.mockResolvedValue([{ id: 5, empresa_id: 1, cliente_id: 2, nome: "Ana Souza", ativo: true, portal_acesso: "ACOMPANHAR" }]);
    const painel = await abrirPainel();
    expect(await within(painel).findByText("Ninguém deste cliente pode responder pelo portal.")).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: /Dar acesso a um contato/ })).toBeInTheDocument();
  });

  it("mostra quem responde e o botão de gerenciar acesso", async () => {
    mocks.obter.mockResolvedValue(info());
    mocks.contatos.mockResolvedValue([{
      id: 5, empresa_id: 1, cliente_id: 2, nome: "Ana Souza", ativo: true, portal_acesso: "DECIDIR", portal_senha_definida_em: "2026-10-16T10:00:00Z",
    }]);
    const painel = await abrirPainel();
    expect(await within(painel).findByText("Ana Souza")).toBeInTheDocument();
    expect(within(painel).getByRole("button", { name: /Gerenciar acesso/ })).toBeInTheDocument();
  });

  it("abre o link de acompanhamento sem login somente depois do acesso liberado", async () => {
    mocks.obter.mockResolvedValue(info());
    const painel = await abrirPainel();
    mocks.ensure.mockResolvedValueOnce(false);
    fireEvent.click(within(painel).getByRole("button", { name: /Gerenciar link de acompanhamento/ }));
    await waitFor(() => expect(mocks.ensure).toHaveBeenCalled());
    expect(screen.queryByText("Diálogo do link sem login aberto")).not.toBeInTheDocument();

    fireEvent.click(within(painel).getByRole("button", { name: /Gerenciar link de acompanhamento/ }));
    expect(await screen.findByText("Diálogo do link sem login aberto")).toBeInTheDocument();
  });

  it("mensagens e histórico ficam em listas com altura máxima e rolagem, com OC no histórico", async () => {
    const resposta = {
      id: 9, origem: "PORTAL_CLIENTE" as const, decisao: "APROVAR" as const, registradaEm: "2026-10-14T14:32:00Z",
      contato: "Ana Souza", ordemCompra: "4500123",
    };
    mocks.obter.mockResolvedValue(info({
      resposta,
      historico: [resposta],
      solicitacoes: [{ id: 31, tipo: "NEGOCIAR", mensagem: "Consegue fazer por 200?", criadaEm: "2026-10-15T10:00:00Z", contatoTelefone: "71988887777" }],
    }));
    const painel = await abrirPainel();
    const mensagens = within(painel).getByRole("region", { name: "Mensagens do cliente" });
    expect(mensagens.querySelector("ul")?.className).toMatch(/max-h-.*overflow-y-auto/);
    expect(within(mensagens).getByText(/\(71\) 98888-7777/)).toBeInTheDocument();
    const historico = within(painel).getByRole("region", { name: /Histórico de respostas/ });
    expect(historico.querySelector("ul")?.className).toMatch(/max-h-.*overflow-y-auto/);
    expect(within(historico).getByText(/OC nº 4500123/)).toBeInTheDocument();
  });

  it("em APROVADO a versão encerrada não pede nova publicação", async () => {
    mocks.obter.mockResolvedValue(info({ encerradaMotivo: "APROVADO" }));
    const painel = await abrirPainel({ ...equipamento, status: "APROVADO" });
    expect(within(painel).getByText(/já passou da etapa de aprovação/)).toBeInTheDocument();
    expect(within(painel).queryByText(/publique uma nova versão/)).not.toBeInTheDocument();
    expect(within(painel).queryByRole("button", { name: "Publicar no Portal do Cliente" })).not.toBeInTheDocument();
  });
});
