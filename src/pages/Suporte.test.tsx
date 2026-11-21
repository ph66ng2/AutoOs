import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  config: { token_neste_computador: true, canal: "C0CE5M6GTRV" } as { token_neste_computador: boolean; canal: string | null },
  chamados: [] as unknown[],
  abrirChamado: vi.fn(),
  responder: vi.fn(),
  retorno: vi.fn(),
  mensagens: [] as unknown[],
  admin: false,
}));
vi.mock("@/hooks/useSuporte", () => ({
  useSuporte: () => ({ config: m.config, chamados: m.chamados, loading: false, error: null, abrirChamado: m.abrirChamado, responder: m.responder, retorno: m.retorno, recarregar: vi.fn() }),
  useMensagensChamado: () => m.mensagens,
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ hasPermission: () => m.admin }) }));
vi.mock("@/lib/error-utils", () => ({ versaoDoApp: () => "0.6.4" }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import Suporte from "./Suporte";

function EnviarErro() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate("/suporte", { state: { relatorioErro: "Relatório novo", tela: "/clientes" } })}>Simular erro do sino</button>;
}

function renderizar(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: "/suporte", state }]}>
      <EnviarErro />
      <Suporte />
    </MemoryRouter>,
  );
}

describe("Suporte", () => {
  beforeEach(() => {
    m.config = { token_neste_computador: true, canal: "C0CE5M6GTRV" };
    m.chamados = [];
    m.abrirChamado.mockReset().mockResolvedValue({ id: 12 });
    m.responder.mockReset().mockResolvedValue({ id: 12 });
    m.retorno.mockReset().mockResolvedValue({ id: 12 });
    m.mensagens = [{ id: 1, autor: "suporte", autor_nome: "Erykah", texto: "Recarregue a OS. *Não envie* ainda.", automatica: true, criado_em: "2026-11-21 10:00:00.123456+00" }];
  });

  it("envia o texto com Ctrl+Enter, levando versão, tela e o relatório do erro", async () => {
    const user = userEvent.setup();
    renderizar({ relatorioErro: "AutoOS — relatório de erro\nCódigo: X", tela: "/equipamentos/10" });
    expect(screen.getByText("Relatório do erro anexado")).toBeInTheDocument();
    await user.type(screen.getByLabelText("O que aconteceu?"), "Não salva a OS");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(m.abrirChamado).toHaveBeenCalledWith({
      texto: "Não salva a OS",
      tela: "/equipamentos/10",
      versao: "0.6.4",
      relatorio_erro: "AutoOS — relatório de erro\nCódigo: X",
      imagens: [],
    });
  });

  it("sem configuração neste computador, avisa e não deixa enviar", async () => {
    const user = userEvent.setup();
    m.config = { token_neste_computador: false, canal: "C0CE5M6GTRV" };
    renderizar();
    expect(screen.getByText("O suporte ainda não foi configurado neste computador.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("O que aconteceu?"), "Oi");
    expect(screen.getByRole("button", { name: /Enviar/ })).toBeDisabled();
  });

  it("lista os chamados e mostra a conversa com a resposta automática", async () => {
    const user = userEvent.setup();
    m.chamados = [{ id: 12, texto: "Não salva a OS", situacao: "aberto", criado_em: "2026-11-21 09:00:00+00", atualizado_em: "2026-11-21 10:00:00+00", respostas: 1 }];
    renderizar();
    await user.click(screen.getByRole("button", { name: /Chamado #12/ }));
    expect(screen.getByText(/Recarregue a OS\./)).toBeInTheDocument();
    // "+00" sem minutos, como o PostgreSQL devolve TIMESTAMPTZ em texto: a data não pode sumir.
    expect(screen.getByText(/Erykah · resposta automática · 21\/11\/2026, 07:00/)).toBeInTheDocument();
  });

  it("o rascunho continua ao olhar outro chamado e voltar para o Novo", async () => {
    const user = userEvent.setup();
    m.chamados = [{ id: 12, texto: "Não salva a OS", situacao: "aberto", criado_em: "2026-11-21 09:00:00+00", atualizado_em: "2026-11-21 10:00:00+00", respostas: 1 }];
    renderizar();
    await user.type(screen.getByLabelText("O que aconteceu?"), "Meio escrito");
    await user.click(screen.getByRole("button", { name: /Chamado #12/ }));
    await user.click(screen.getByRole("button", { name: /Novo/ }));
    expect(screen.getByLabelText("O que aconteceu?")).toHaveValue("Meio escrito");
  });

  it("erro enviado com a página já aberta troca o relatório anexado e leva a tela dele", async () => {
    const user = userEvent.setup();
    m.chamados = [{ id: 12, texto: "Não salva a OS", situacao: "aberto", criado_em: "2026-11-21 09:00:00+00", atualizado_em: "2026-11-21 10:00:00+00", respostas: 1 }];
    renderizar();
    await user.click(screen.getByRole("button", { name: /Chamado #12/ }));
    await user.click(screen.getByRole("button", { name: "Simular erro do sino" }));
    expect(screen.getByText("Relatório do erro anexado")).toBeInTheDocument();
    await user.type(screen.getByLabelText("O que aconteceu?"), "Erro na lista");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(m.abrirChamado).toHaveBeenCalledWith(expect.objectContaining({ relatorio_erro: "Relatório novo", tela: "/clientes" }));
  });

  it("envio em andamento continua travado depois de olhar outro chamado e voltar ao Novo", async () => {
    const user = userEvent.setup();
    m.chamados = [{ id: 12, texto: "Não salva a OS", situacao: "aberto", criado_em: "2026-11-21 09:00:00+00", atualizado_em: "2026-11-21 10:00:00+00", respostas: 1 }];
    m.abrirChamado.mockReset().mockReturnValue(new Promise(() => undefined));
    renderizar();
    await user.type(screen.getByLabelText("O que aconteceu?"), "Uma vez só");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.click(screen.getByRole("button", { name: /Chamado #12/ }));
    await user.click(screen.getByRole("button", { name: /Novo/ }));
    expect(screen.getByRole("button", { name: /Enviando/ })).toBeDisabled();
    await user.click(screen.getByLabelText("O que aconteceu?"));
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(m.abrirChamado).toHaveBeenCalledTimes(1);
  });

  const aberto12 = { id: 12, texto: "Não salva a OS", situacao: "aberto", criado_em: "2026-11-21 09:00:00+00", atualizado_em: "2026-11-21 10:00:00+00", respostas: 1 };

  it("responde pelo app na thread do chamado e mostra o negrito do Slack", async () => {
    const user = userEvent.setup();
    m.chamados = [aberto12];
    renderizar();
    await user.click(screen.getByRole("button", { name: /Chamado #12/ }));
    expect(screen.getByText("Não envie").tagName).toBe("STRONG");
    await user.type(screen.getByLabelText("Responder"), "Recarreguei e voltou a salvar");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(m.responder).toHaveBeenCalledWith({ id: 12, texto: "Recarreguei e voltou a salvar", imagens: [] });
  });

  it("depois de uma resposta do suporte pergunta se resolveu; Resolveu e Não resolveu chegam ao backend", async () => {
    const user = userEvent.setup();
    m.chamados = [aberto12];
    renderizar();
    await user.click(screen.getByRole("button", { name: /Chamado #12/ }));
    expect(screen.getByText("Isso resolveu?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Não resolveu" }));
    expect(m.retorno).toHaveBeenLastCalledWith(12, false);
    await user.click(screen.getByRole("button", { name: /Resolveu/ }));
    expect(m.retorno).toHaveBeenLastCalledWith(12, true);
  });

  it("sem resposta do suporte ainda, não pergunta; chamado resolvido não tem caixa de resposta", async () => {
    const user = userEvent.setup();
    m.chamados = [aberto12, { ...aberto12, id: 9, situacao: "resolvido" }];
    m.mensagens = [{ id: 1, autor: "pessoa", autor_nome: "Ana", texto: "Não salva", automatica: false, criado_em: "2026-11-21 10:00:00+00" }];
    renderizar();
    await user.click(screen.getByRole("button", { name: /Chamado #12/ }));
    expect(screen.queryByText("Isso resolveu?")).not.toBeInTheDocument();
    expect(screen.getByText(/assim que o suporte responder/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Chamado #9/ }));
    expect(screen.queryByLabelText("Responder")).not.toBeInTheDocument();
    expect(screen.getByText(/Chamado resolvido/)).toBeInTheDocument();
  });

  it("'Ver' no aviso de resposta abre o chamado pelo estado da navegação", () => {
    m.chamados = [aberto12];
    renderizar({ chamadoId: 12 });
    expect(screen.getByRole("heading", { name: "Chamado #12" })).toBeInTheDocument();
  });

  it("enquanto envia, o rascunho fica parado (o que vai é o que está na tela)", async () => {
    const user = userEvent.setup();
    m.abrirChamado.mockReset().mockReturnValue(new Promise(() => undefined));
    renderizar();
    await user.type(screen.getByLabelText("O que aconteceu?"), "Primeira versão");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await user.type(screen.getByLabelText("O que aconteceu?"), " mais coisa");
    expect(screen.getByLabelText("O que aconteceu?")).toHaveValue("Primeira versão");
    expect(screen.getByRole("button", { name: "Anexar print" })).toBeDisabled();
  });
});
