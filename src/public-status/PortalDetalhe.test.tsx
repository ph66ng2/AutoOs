import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PortalDetalhe from "./PortalDetalhe";
import { portalApi, type DetalheAtendimento, type OrcamentoPortal } from "./portal-api";
import type { PortalSession } from "./portal-session";

vi.mock("./portal-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./portal-api")>();
  return { ...original, portalApi: { detalhe: vi.fn(), responder: vi.fn(), solicitar: vi.fn(), confirmarSenha: vi.fn() } };
});

const gerarPdf = vi.fn(async () => {});
vi.mock("./portal-pdf", async (importOriginal) => {
  const original = await importOriginal<typeof import("./portal-pdf")>();
  return { ...original, gerarPdf: (...args: unknown[]) => (gerarPdf as (...a: unknown[]) => Promise<void>)(...args) };
});

const api = vi.mocked(portalApi);
const session: PortalSession = { token: "e".repeat(64), contato: "Ana Souza", acesso: "DECIDIR", expiraEm: new Date(Date.now() + 3_600_000).toISOString() };

function orcamento(extra: Partial<OrcamentoPortal> = {}): OrcamentoPortal {
  return {
    versaoId: 9, versao: 2, publicadaEm: "2026-10-14T12:00:00Z", valorTotal: 350, validoAte: null, estado: "ABERTA",
    servicos: [{ descricao: "Troca do fusor", valor: 250, pecas: [{ nome: "Fusor", quantidade: 1, valorUnitario: 100 }] }],
    pecas: [], janelaMinutos: 15, aceiteOnline: true, resposta: null, ...extra,
  };
}

const ENDERECO = "Rua das Flores, 100, Salvador - BA";

function detalhe(extra: Partial<DetalheAtendimento> = {}): DetalheAtendimento {
  return {
    id: 28, equipamento: "Impressora Zebra ZT230", serie: "SER-123", patrimonio: null,
    status: "AGUARDANDO_APROVACAO", titulo: "O orçamento aguarda sua resposta", orientacao: "Confira a proposta abaixo.",
    statusAlteradoEm: "2026-10-14T12:00:00Z", entradaEm: "2026-10-10T12:00:00Z",
    cliente: { nome: "Cliente A", documento: "11222333000181", exigeOrdemCompra: false },
    defeitoRelatado: "Não imprime",
    valores: { orcamento: 350, final: null, atual: 350 },
    etapas: [
      { status: "RECEBIDO", em: "2026-10-10T12:00:00Z" },
      { status: "EM_VERIFICACAO", em: "2026-10-11T12:00:00Z" },
      { status: "AGUARDANDO_APROVACAO", em: "2026-10-14T12:00:00Z" },
    ],
    fotos: [], historico: [], orcamento: orcamento(), solicitacoes: [],
    contatoEmpresa: { nome: "BMI TAG", whatsapp: null, email: "contato@bmitag.invalid", telefone: null, horario: null, endereco: null, mapsUrl: null },
    podeDecidir: true, verificacaoRecente: true, contato: "Ana Souza", temTelefone: true, temEmail: true,
    ...extra,
  };
}

const foto = (id: number, categoria: "ENTRADA" | "VERIFICACAO" | "SAIDA") =>
  ({ id, categoria, url: `https://sgaqvxubopgwysnyocjs.supabase.co/storage/v1/f${id}.jpg`, largura: 800, altura: 600 });

async function abrir(d: DetalheAtendimento) {
  api.detalhe.mockResolvedValue(d);
  render(<PortalDetalhe session={session} equipamentoId={28} onExpirou={() => {}} />);
  await screen.findByText("Impressora Zebra ZT230");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fotos", () => {
  it("agrupa por categoria, com lazy, tamanho reservado e texto alternativo; destaque na decisão", async () => {
    await abrir(detalhe({ fotos: [foto(1, "ENTRADA"), foto(2, "ENTRADA"), foto(3, "VERIFICACAO")] }));
    const secao = screen.getByRole("region", { name: "Fotos do equipamento" });
    expect(within(secao).getByRole("heading", { name: /Entrada/ })).toBeInTheDocument();
    expect(within(secao).getByRole("heading", { name: /Verificação/ })).toBeInTheDocument();
    expect(within(secao).queryByRole("heading", { name: /Saída/ })).toBeNull();
    const imgs = within(secao).getAllByRole("img");
    expect(imgs).toHaveLength(3);
    for (const img of imgs) {
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).toHaveAttribute("width");
      expect(img).toHaveAttribute("height");
      expect(img.getAttribute("alt")).toMatch(/^Foto de /);
    }
  });

  it("amplia, navega e fecha com Esc e com toque", async () => {
    await abrir(detalhe({ fotos: [foto(1, "ENTRADA"), foto(2, "SAIDA")] }));
    fireEvent.click(screen.getAllByRole("button", { name: /Ampliar foto de entrada/i })[0]);
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByText("Entrada · 1 de 2")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Próxima foto" }));
    expect(within(dialogo).getByText("Saída · 2 de 2")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(within(dialogo).getByText("Entrada · 1 de 2")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /Ampliar foto de entrada/i })[0]);
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sem fotos não mostra seção", async () => {
    await abrir(detalhe());
    expect(screen.queryByText(/^Fotos/)).toBeNull();
  });
});

describe("documentos", () => {
  it("gera o PDF do orçamento sob demanda", async () => {
    await abrir(detalhe());
    fireEvent.click(screen.getByRole("button", { name: "Orçamento (PDF)" }));
    await waitFor(() => expect(gerarPdf).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: /Comprovante de entrega/ })).toBeNull();
  });

  it("mostra o comprovante de entrega quando entregue", async () => {
    await abrir(detalhe({ status: "ENTREGUE", titulo: "Equipamento entregue", valores: { orcamento: 350, final: 350, atual: 350 } }));
    expect(screen.getByRole("button", { name: "Comprovante de entrega (PDF)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Orçamento (PDF)" })).toBeInTheDocument();
  });
});

describe("etapas", () => {
  it("mostra data e hora da etapa concluída ao tocar, acessível pelo teclado", async () => {
    await abrir(detalhe());
    const nav = screen.getByRole("navigation", { name: "Etapas do atendimento" });
    expect(within(nav).getByText("Acompanhamento do atendimento")).toBeInTheDocument();
    const botao = within(nav).getByRole("button", { name: /Recebido/ });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(botao.getAttribute("aria-describedby")).toBe(within(nav).getAllByRole("tooltip", { hidden: true })[0].id);
    expect(within(nav).getAllByRole("tooltip", { hidden: true })[0].textContent).toMatch(/Registrada em 10\/10\/2026/);
    // Etapas futuras não têm data.
    expect(within(nav).queryByRole("button", { name: /Aprovado/ })).toBeNull();
  });
});

describe("histórico", () => {
  it("lista respostas e pedidos de todas as versões com situação em português claro", async () => {
    await abrir(detalhe({
      historico: [
        { tipo: "RESPOSTA", subtipo: "RECUSAR", versao: 2, valor: 350, em: "2026-10-15T12:00:00Z", contato: "Ana Souza", protocolo: "R-9", mensagem: null, situacao: "EFETIVADA", ordemCompra: null },
        { tipo: "SOLICITACAO", subtipo: "NEGOCIAR", versao: 2, valor: 350, em: "2026-10-14T13:00:00Z", contato: "Ana Souza", protocolo: "S-3", mensagem: "Consegue desconto?", situacao: "TRATADA", ordemCompra: null },
        { tipo: "RESPOSTA", subtipo: "APROVAR", versao: 1, valor: 400, em: "2026-10-12T12:00:00Z", contato: "Beto", protocolo: "R-4", mensagem: null, situacao: "SUBSTITUIDA", ordemCompra: "OC-77" },
      ],
    }));
    expect(screen.queryByText("Pedidos enviados")).toBeNull();
    const secao = screen.getByRole("region", { name: "Histórico" });
    const itens = within(secao).getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    expect(itens[0]).toHaveClass("is-recusa");
    expect(itens[0]).toHaveTextContent("Recusa do orçamento");
    expect(itens[0]).toHaveTextContent("efetivada pela equipe");
    expect(itens[1]).toHaveClass("is-neutro");
    expect(itens[1]).toHaveTextContent("Consegue desconto?");
    expect(itens[1]).toHaveTextContent("tratado pela equipe");
    expect(itens[2]).toHaveClass("is-aceite");
    expect(itens[2]).toHaveTextContent("Versão 1");
    expect(itens[2]).toHaveTextContent("Protocolo R-4");
    expect(itens[2]).toHaveTextContent("Ordem de compra: OC-77");
    expect(itens[2]).toHaveTextContent("substituída por resposta mais nova");
  });
});

describe("pronto para retirada", () => {
  const pronto = (extra: Partial<DetalheAtendimento> = {}) => detalhe({
    status: "PRONTO", titulo: "Pronto para retirada", orcamento: orcamento({ estado: "ENCERRADA" }), valores: { orcamento: 350, final: null, atual: 350 },
    contatoEmpresa: { nome: "BMI TAG", whatsapp: null, email: null, telefone: null, horario: "Seg a sex", endereco: ENDERECO, mapsUrl: "https://maps.app.goo.gl/abc" },
    ...extra,
  });

  it("mostra endereço, mapa embutido, botão do Google Maps e o valor", async () => {
    await abrir(pronto());
    const secao = screen.getByRole("region", { name: "Retire no endereço abaixo" });
    expect(within(secao).getByText(ENDERECO)).toBeInTheDocument();
    expect(within(secao).getByText(/R\$\s*350,00/)).toBeInTheDocument();
    const mapa = within(secao).getByTitle(`Mapa: ${ENDERECO}`);
    expect(mapa.getAttribute("src")).toBe(`https://www.google.com/maps?q=${encodeURIComponent(ENDERECO)}&output=embed`);
    expect(within(secao).getByRole("link", { name: "Abrir no Google Maps" })).toHaveAttribute("href", "https://maps.app.goo.gl/abc");
  });

  it("sem mapsUrl usa busca com o endereço; sem endereço não há mapa, mas o valor continua", async () => {
    await abrir(pronto({ contatoEmpresa: { nome: "BMI TAG", whatsapp: null, email: null, telefone: null, horario: null, endereco: ENDERECO, mapsUrl: null } }));
    expect(screen.getByRole("link", { name: "Abrir no Google Maps" }).getAttribute("href")).toContain("https://www.google.com/maps/search/?api=1&query=");
  });

  it("sem endereço configurado mostra só o texto e o valor", async () => {
    await abrir(pronto({ contatoEmpresa: null }));
    expect(screen.queryByTitle(/^Mapa/)).toBeNull();
    expect(screen.queryByRole("link", { name: "Abrir no Google Maps" })).toBeNull();
    expect(screen.getByRole("region", { name: "Seu equipamento está pronto" })).toHaveTextContent(/R\$\s*350,00/);
  });
});

describe("entregue", () => {
  const entregue = (valores: DetalheAtendimento["valores"]) => detalhe({
    status: "ENTREGUE", titulo: "Equipamento entregue", orcamento: orcamento({ estado: "ENCERRADA" }), valores,
    etapas: [{ status: "RECEBIDO", em: "2026-10-10T12:00:00Z" }, { status: "ENTREGUE", em: "2026-10-20T12:00:00Z" }],
  });

  it("vira Atendimento concluído com valor final e documentos", async () => {
    await abrir(entregue({ orcamento: 350, final: 350, atual: 350 }));
    expect(screen.getByRole("heading", { level: 1, name: "Atendimento concluído" })).toBeInTheDocument();
    const resumo = screen.getByRole("region", { name: "Resumo da entrega" });
    expect(resumo).toHaveTextContent(/Valor final\s*R\$\s*350,00/);
    expect(resumo).not.toHaveTextContent("ajustado na entrega");
    expect(within(resumo).getByRole("button", { name: "Comprovante de entrega (PDF)" })).toBeInTheDocument();
  });

  it("valor final diferente mostra os dois com a nota", async () => {
    await abrir(entregue({ orcamento: 350, final: 420, atual: 420 }));
    const resumo = screen.getByRole("region", { name: "Resumo da entrega" });
    expect(resumo).toHaveTextContent(/R\$\s*420,00/);
    expect(resumo).toHaveTextContent(/Valor orçado: R\$\s*350,00/);
    expect(resumo).toHaveTextContent("valor final ajustado na entrega".replace("valor", "Valor"));
  });
});

describe("valor atualizado após aprovação", () => {
  it("avisa quando o valor atual difere do orçamento aprovado", async () => {
    await abrir(detalhe({ status: "EM_MANUTENCAO", titulo: "Serviço em andamento", orcamento: orcamento({ estado: "ENCERRADA" }), valores: { orcamento: 350, final: null, atual: 400 } }));
    const nota = screen.getByText(/Valor atualizado pela equipe/);
    expect(nota).toHaveTextContent(/R\$\s*400,00/);
    expect(nota).toHaveTextContent(/orçamento aprovado: R\$\s*350,00/);
  });

  it("não avisa antes da aprovação nem quando os valores batem", async () => {
    await abrir(detalhe({ valores: { orcamento: 350, final: null, atual: 400 } }));
    expect(screen.queryByText(/Valor atualizado pela equipe/)).toBeNull();
  });
});
