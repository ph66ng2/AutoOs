import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalApp from "./PortalApp";
import { PortalError, portalApi, type DetalheAtendimento, type OrcamentoPortal } from "./portal-api";
import { areaFromHash } from "./portal-session";

vi.mock("./portal-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./portal-api")>();
  return {
    ...original,
    portalApi: {
      entrarSenha: vi.fn(),
      confirmarSenha: vi.fn(),
      listar: vi.fn(),
      detalhe: vi.fn(),
      responder: vi.fn(),
      solicitar: vi.fn(),
      sair: vi.fn(async () => ({ ok: true })),
    },
  };
});

const api = vi.mocked(portalApi);
const TOKEN = "e".repeat(64);
const FUTURO = new Date(Date.now() + 10 * 60_000).toISOString();

function orcamento(extra: Partial<OrcamentoPortal> = {}): OrcamentoPortal {
  return {
    versaoId: 9,
    versao: 2,
    publicadaEm: "2026-10-14T12:00:00Z",
    valorTotal: 350,
    validoAte: null,
    estado: "ABERTA",
    servicos: [{ descricao: "Troca do fusor", valor: 250, pecas: [{ nome: "Fusor", quantidade: 1, valorUnitario: 100 }] }],
    pecas: [],
    janelaMinutos: 15,
    aceiteOnline: true,
    resposta: null,
    ...extra,
  };
}

function detalhe(extra: Partial<DetalheAtendimento> = {}): DetalheAtendimento {
  return {
    id: 28,
    equipamento: "Impressora Zebra ZT230",
    serie: "SER-123",
    patrimonio: null,
    status: "AGUARDANDO_APROVACAO",
    titulo: "O orçamento aguarda sua resposta",
    orientacao: "Confira a proposta abaixo.",
    statusAlteradoEm: "2026-10-14T12:00:00Z",
    entradaEm: "2026-10-10T12:00:00Z",
    orcamento: orcamento(),
    solicitacoes: [],
    contatoEmpresa: { nome: "BMI TAG", whatsapp: "71933334444", email: "contato@bmitag.invalid", telefone: null, horario: "Seg a sex, 8h às 18h" },
    podeDecidir: true,
    verificacaoRecente: true,
    contato: "Ana Souza",
    ...extra,
  };
}

function logar(acesso: "DECIDIR" | "ACOMPANHAR" = "DECIDIR") {
  window.sessionStorage.setItem("autoos.portal.sessao", JSON.stringify({
    token: TOKEN, contato: "Ana Souza", acesso, expiraEm: new Date(Date.now() + 3_600_000).toISOString(),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.location.hash = "";
});

describe("roteamento", () => {
  it("mantém o link de acompanhamento fora do portal; o antigo link de decisão cai no portal", () => {
    expect(areaFromHash(`#/c/${"a".repeat(64)}`)).toBe("status");
    // O link de decisão individual foi substituído pelo portal: cai no login.
    expect(areaFromHash(`#/o/${"a".repeat(64)}`)).toBe("portal");
    expect(areaFromHash("")).toBe("portal");
    expect(areaFromHash("#/atendimentos/3")).toBe("portal");
  });
});

describe("login", () => {
  it("só existe a entrada com senha: nada de código por WhatsApp ou email", () => {
    render(<PortalApp />);
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.queryByText(/código/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Peça à equipe BMI TAG uma nova/)).toBeInTheDocument();
  });
});

describe("login com senha", () => {
  it("entra com CNPJ + senha criada pelo operador", async () => {
    api.entrarSenha.mockResolvedValue({ sessao: TOKEN, contato: "Ana Souza", acesso: "DECIDIR", expiraEm: FUTURO });
    api.listar.mockResolvedValue({ cliente: "Cliente A", contato: "Ana Souza", podeDecidir: true, atendimentos: [] });
    render(<PortalApp />);
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "11222333000181" } });
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Ana-Senha-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByRole("heading", { name: "Cliente A" })).toBeInTheDocument();
    expect(api.entrarSenha).toHaveBeenCalledWith("11222333000181", "Ana-Senha-2026");
    expect(JSON.parse(window.sessionStorage.getItem("autoos.portal.sessao") ?? "{}").token).toBe(TOKEN);
  });

  it("senha incorreta mostra erro sem entrar", async () => {
    api.entrarSenha.mockRejectedValue(new PortalError("CPF/CNPJ ou senha incorretos.", 400, "SENHA_INVALIDA"));
    render(<PortalApp />);
    fireEvent.change(screen.getByLabelText("CPF ou CNPJ"), { target: { value: "11222333000181" } });
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "errada" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("CPF/CNPJ ou senha incorretos.")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("autoos.portal.sessao")).toBeNull();
  });
});

describe("lista", () => {
  it("separa atuais e histórico e ordena por atividade ou entrada", async () => {
    logar();
    api.listar.mockResolvedValue({
      cliente: "Cliente A", contato: "Ana Souza", podeDecidir: true,
      atendimentos: [
        { id: 1, equipamento: "Zebra antiga", serie: "A1", patrimonio: null, status: "RECEBIDO", titulo: "Recebemos seu equipamento", historico: false,
          entradaEm: "2026-10-12T00:00:00Z", atividadeEm: "2026-10-12T00:00:00Z", statusAlteradoEm: null, aguardaResposta: false, resposta: null },
        { id: 2, equipamento: "Epson com orçamento", serie: "B2", patrimonio: "P-9", status: "AGUARDANDO_APROVACAO", titulo: "O orçamento aguarda sua resposta",
          historico: false, entradaEm: "2026-10-01T00:00:00Z", atividadeEm: "2026-10-14T00:00:00Z", statusAlteradoEm: null, aguardaResposta: true, resposta: null },
        { id: 3, equipamento: "HP entregue", serie: "C3", patrimonio: null, status: "ENTREGUE", titulo: "Equipamento entregue", historico: true,
          entradaEm: "2026-01-01T00:00:00Z", atividadeEm: "2026-02-01T00:00:00Z", statusAlteradoEm: null, aguardaResposta: false, resposta: null },
      ],
    });
    render(<PortalApp />);
    const lista = await screen.findByRole("list");
    const nomes = () => within(lista).getAllByRole("link").map((link) => link.textContent ?? "");
    expect(nomes()[0]).toContain("Epson com orçamento");
    expect(screen.getByText("1 orçamento aguarda sua resposta.")).toBeInTheDocument();
    expect(nomes().some((nome) => nome.includes("HP entregue"))).toBe(false);

    fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "ENTRADA" } });
    expect(nomes()[0]).toContain("Zebra antiga");

    fireEvent.click(screen.getByRole("tab", { name: "Histórico (1)" }));
    expect(nomes()).toHaveLength(1);
    expect(nomes()[0]).toContain("HP entregue");
  });
});

describe("detalhe e orçamento", () => {
  beforeEach(() => {
    logar();
    window.location.hash = "#/atendimentos/28";
  });

  it("reaproveita a tela de status e confirma o aceite com impressora e valor", async () => {
    api.detalhe.mockResolvedValue(detalhe());
    api.responder.mockResolvedValue({
      comprovante: {
        id: 77, protocolo: "R-77", decisao: "APROVAR", registradaEm: "2026-10-15T15:00:00Z", janelaAte: FUTURO,
        versao: 2, valorTotal: 350, equipamento: "Impressora Zebra ZT230", serie: "SER-123", contato: "Ana Souza", repetida: false,
      },
    });
    render(<PortalApp />);

    expect(await screen.findByRole("heading", { name: "O orçamento aguarda sua resposta" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Etapas do atendimento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar orçamento" }));

    const confirmacao = screen.getByRole("alertdialog");
    expect(within(confirmacao).getByText("Impressora Zebra ZT230")).toBeInTheDocument();
    expect(within(confirmacao).getByText(/R\$\s*350,00/)).toBeInTheDocument();
    fireEvent.click(within(confirmacao).getByRole("button", { name: "Confirmar aceite" }));

    expect(await screen.findByText("Resposta registrada no AutoOS")).toBeInTheDocument();
    expect(api.responder).toHaveBeenCalledWith(TOKEN, 28, 9, "APROVAR", null);
    const whatsapp = screen.getByRole("link", { name: "Abrir no WhatsApp" });
    expect(whatsapp.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/5571933334444\?text=/);
    expect(decodeURIComponent(whatsapp.getAttribute("href") ?? "")).toContain("Protocolo R-77");
  });

  it("verificação antiga: reconfirma a senha antes de decidir, sem código", async () => {
    api.detalhe.mockResolvedValue(detalhe({ verificacaoRecente: false }));
    api.confirmarSenha.mockResolvedValue({ ok: true });
    render(<PortalApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Aceitar orçamento" }));
    fireEvent.change(screen.getByLabelText("Senha"), { target: { value: "Ana-Senha-2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar senha" }));
    expect(await screen.findByRole("heading", { name: "Confirmar ACEITE do orçamento inteiro?" })).toBeInTheDocument();
    expect(api.confirmarSenha).toHaveBeenCalledWith(TOKEN, "Ana-Senha-2026");
    expect(screen.queryByText(/código/i)).not.toBeInTheDocument();
  });

  it("proposta alterada invalida a confirmação antiga e pede releitura", async () => {
    api.detalhe.mockResolvedValueOnce(detalhe()).mockResolvedValue(detalhe({ orcamento: orcamento({ versaoId: 10, versao: 3, valorTotal: 300 }) }));
    api.responder.mockRejectedValue(new PortalError("A proposta mudou enquanto a página estava aberta. Releia a versão atual antes de responder.", 409, "PROPOSTA_ALTERADA"));
    render(<PortalApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Aceitar orçamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar aceite" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await screen.findByText(/Releia a versão atual|atualizada para a versão 3/)).toBeInTheDocument();
    expect(screen.getByText(/Versão 3/)).toBeInTheDocument();
  });

  it("no prazo de correção, quem respondeu só vê um Desfazer discreto; outro contato não", async () => {
    const resposta = {
      id: 77, decisao: "APROVAR" as const, origem: "PORTAL_CLIENTE" as const, registradaEm: new Date().toISOString(), janelaAte: FUTURO,
      contato: "Ana Souza", propria: true, estado: "EM_CORRECAO" as const, efetivadaEm: null, protocolo: "R-77",
    };
    api.detalhe.mockResolvedValue(detalhe({ orcamento: orcamento({ estado: "RESPONDIDA", resposta }) }));
    api.responder.mockResolvedValue({
      comprovante: { id: 78, protocolo: "R-78", decisao: "DESFEITA", registradaEm: new Date().toISOString(), janelaAte: FUTURO,
        versao: 2, valorTotal: 350, equipamento: "Impressora Zebra ZT230", serie: "SER-123", contato: "Ana Souza", repetida: false },
    });
    const { unmount } = render(<PortalApp />);
    const desfazer = await screen.findByRole("button", { name: /Errou\? Desfazer resposta/ });
    expect(screen.queryByRole("button", { name: /Mudei de ideia/ })).not.toBeInTheDocument();
    expect(screen.getByText("Resposta registrada: aceite")).toBeInTheDocument();
    fireEvent.click(desfazer);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar resposta" }));
    await waitFor(() => expect(api.responder).toHaveBeenCalledWith(TOKEN, 28, 9, "DESFEITA", 77));
    unmount();

    api.detalhe.mockResolvedValue(detalhe({ orcamento: orcamento({ estado: "RESPONDIDA", resposta: { ...resposta, propria: false, contato: "Bruno" } }) }));
    render(<PortalApp />);
    expect(await screen.findByText(/Por Bruno/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Desfazer/ })).not.toBeInTheDocument();
  });

  it("barra de decisão (celular) mostra o total e abre a mesma confirmação", async () => {
    api.detalhe.mockResolvedValue(detalhe());
    render(<PortalApp />);
    const barra = await screen.findByRole("region", { name: "Responder ao orçamento" });
    expect(within(barra).getByText(/R\$\s*350,00/)).toBeInTheDocument();
    fireEvent.click(within(barra).getByRole("button", { name: "Recusar" }));
    expect(screen.getByRole("heading", { name: "Confirmar RECUSA do orçamento inteiro?" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Responder ao orçamento" })).not.toBeInTheDocument();
  });

  it("falha de efetivação nunca aparece como aprovação", async () => {
    api.detalhe.mockResolvedValue(detalhe({
      orcamento: orcamento({
        estado: "RESPONDIDA",
        resposta: {
          id: 77, decisao: "APROVAR", origem: "PORTAL_CLIENTE", registradaEm: "2026-10-15T10:00:00Z", janelaAte: "2026-10-15T10:15:00Z",
          contato: "Ana Souza", propria: true, estado: "PENDENTE_EQUIPE", efetivadaEm: null, protocolo: "R-77",
        },
      }),
    }));
    render(<PortalApp />);
    expect(await screen.findByText(/precisa ser confirmada pela equipe/)).toBeInTheDocument();
    expect(screen.queryByText("Orçamento aprovado")).not.toBeInTheDocument();
  });

  it("efetivada oferece Solicitar correção, que registra pedido", async () => {
    api.detalhe.mockResolvedValue(detalhe({
      status: "APROVADO",
      titulo: "Orçamento aprovado",
      orcamento: orcamento({
        estado: "RESPONDIDA",
        resposta: {
          id: 77, decisao: "APROVAR", origem: "PORTAL_CLIENTE", registradaEm: "2026-10-15T10:00:00Z", janelaAte: "2026-10-15T10:15:00Z",
          contato: "Ana Souza", propria: true, estado: "EFETIVADA", efetivadaEm: "2026-10-15T10:16:00Z", protocolo: "R-77",
        },
      }),
    }));
    api.solicitar.mockResolvedValue({ solicitacao: { id: 5, protocolo: "S-5", tipo: "MUDANCA", criadoEm: "2026-10-15T11:00:00Z" } });
    render(<PortalApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Solicitar correção" }));
    fireEvent.change(screen.getByLabelText("O que precisa ser corrigido?"), { target: { value: "Aprovei a impressora errada" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Solicitar correção" }).at(-1)!);
    expect(await screen.findByText("Pedido S-5 registrado no AutoOS")).toBeInTheDocument();
    expect(api.solicitar).toHaveBeenCalledWith(TOKEN, 28, 9, "MUDANCA", "Aprovei a impressora errada");
  });

  it("Quero negociar registra o pedido antes de oferecer o WhatsApp", async () => {
    api.detalhe.mockResolvedValue(detalhe());
    api.solicitar.mockResolvedValue({ solicitacao: { id: 6, protocolo: "S-6", tipo: "NEGOCIAR", criadoEm: "2026-10-15T11:00:00Z" } });
    render(<PortalApp />);
    fireEvent.click(await screen.findByRole("button", { name: "Quero negociar" }));
    expect(screen.queryByRole("link", { name: "Abrir no WhatsApp" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Registrar pedido de negociação" }));
    expect(await screen.findByText("Pedido S-6 registrado no AutoOS")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir no WhatsApp" })).toBeInTheDocument();
    expect(api.responder).not.toHaveBeenCalled();
  });

  it("contato só de acompanhamento não vê botões de decisão", async () => {
    logar("ACOMPANHAR");
    api.detalhe.mockResolvedValue(detalhe({ podeDecidir: false }));
    render(<PortalApp />);
    expect(await screen.findByText("Seu contato pode acompanhar, mas não responder a orçamentos.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aceitar orçamento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quero negociar" })).not.toBeInTheDocument();
  });

  it("sessão expirada volta ao login com aviso", async () => {
    api.detalhe.mockRejectedValue(new PortalError("Sua sessão terminou. Entre novamente.", 401, null));
    render(<PortalApp />);
    expect(await screen.findByText("Sua sessão terminou. Entre novamente.")).toBeInTheDocument();
    expect(screen.getByLabelText("CPF ou CNPJ")).toBeInTheDocument();
    await act(async () => undefined);
    expect(window.sessionStorage.getItem("autoos.portal.sessao")).toBeNull();
  });
});
