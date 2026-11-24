import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EscopoAvisoAoSair, useAvisoAoSair } from "@/hooks/useAvisoAoSair";

const m = vi.hoisted(() => ({
  salvarGarantia: vi.fn(async (dias: number) => dias),
  modelos: [{ id: 1, titulo: "Equipamento pronto", texto: "Olá, {contato}!", ordem: 1, atualizado_em: "2026-11-21 10:00:00+00" }],
  salvarModelo: vi.fn(),
  obterContato: vi.fn(),
  salvarContato: vi.fn(),
}));
vi.mock("@/hooks/useGarantiaServicos", () => ({ useGarantiaServicos: () => ({ dias: 90, salvar: m.salvarGarantia }) }));
vi.mock("@/hooks/useModelosMensagem", () => ({
  useModelosMensagem: () => ({ modelos: m.modelos, loading: false, error: null, salvar: m.salvarModelo, excluir: vi.fn(), recarregar: vi.fn() }),
}));
vi.mock("@/lib/db", () => ({
  db: { obterContatoPortalEmpresa: m.obterContato, salvarContatoPortalEmpresa: m.salvarContato, abrirUrl: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { GarantiaServicosCard } from "./GarantiaServicosCard";
import { MensagensProntasCard } from "./MensagensProntasCard";
import { PortalContatoEmpresaCard } from "./PortalContatoEmpresaCard";

/** Aba de Configurações simplificada: o cartão dentro do escopo e um jeito de sair da aba. */
function Aba({ children }: { children: ReactNode }) {
  const aviso = useAvisoAoSair(false);
  const [saiu, setSaiu] = useState(false);
  return (
    <EscopoAvisoAoSair aviso={aviso}>
      <button type="button" onClick={() => aviso.sairComAviso(() => setSaiu(true))}>Outra aba</button>
      {saiu ? <p>Saiu da aba</p> : children}
      {aviso.dialogo}
    </EscopoAvisoAoSair>
  );
}

async function sairDaAba(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Outra aba" }));
}

describe("cartões com Salvar próprio informam o que não foi salvo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.salvarModelo.mockResolvedValue({ id: 2 });
    m.obterContato.mockResolvedValue({ nomeExibicao: "Empresa", whatsapp: "71999990000", endereco: "Rua A, 10", mapsUrl: null });
    m.salvarContato.mockImplementation(async (input) => input);
  });

  it("Garantia: prazo mudado pergunta; depois de salvar sai direto", async () => {
    const user = userEvent.setup();
    render(<Aba><GarantiaServicosCard /></Aba>);
    const campo = screen.getByLabelText("Garantia dos serviços em dias");
    await user.clear(campo);
    await user.type(campo, "120");
    await sairDaAba(user);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(m.salvarGarantia).toHaveBeenCalledWith(120));
    await sairDaAba(user);
    expect(await screen.findByText("Saiu da aba")).toBeInTheDocument();
  });

  it("Mensagens prontas: abrir uma mensagem sem mudar sai direto", async () => {
    const user = userEvent.setup();
    render(<Aba><MensagensProntasCard /></Aba>);
    await user.click(screen.getByRole("button", { name: "Editar Equipamento pronto" }));
    await sairDaAba(user);
    expect(await screen.findByText("Saiu da aba")).toBeInTheDocument();
  });

  it("Mensagens prontas: mensagem nova com texto pergunta", async () => {
    const user = userEvent.setup();
    render(<Aba><MensagensProntasCard /></Aba>);
    await user.click(screen.getByRole("button", { name: /nova mensagem/i }));
    await user.type(screen.getByLabelText("Nome"), "Orçamento");
    await sairDaAba(user);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(await screen.findByText("Saiu da aba")).toBeInTheDocument();
  });

  it("Contato do portal: carregado sai direto; canal mudado pergunta; salvo sai direto", async () => {
    const user = userEvent.setup();
    render(<Aba><PortalContatoEmpresaCard /></Aba>);
    const whatsapp = await screen.findByLabelText("WhatsApp da equipe (com DDD)");
    await waitFor(() => expect(whatsapp).toHaveValue("71999990000"));
    await user.type(whatsapp, "1");
    await sairDaAba(user);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    await user.click(screen.getByRole("button", { name: "Salvar contato do portal" }));
    await waitFor(() => expect(m.salvarContato).toHaveBeenCalled());
    await screen.findByText("Contato do portal salvo.");
    await sairDaAba(user);
    expect(await screen.findByText("Saiu da aba")).toBeInTheDocument();
  });

  it("Contato do portal: sem mudança sai direto", async () => {
    const user = userEvent.setup();
    render(<Aba><PortalContatoEmpresaCard /></Aba>);
    const whatsapp = await screen.findByLabelText("WhatsApp da equipe (com DDD)");
    await waitFor(() => expect(whatsapp).toHaveValue("71999990000"));
    await sairDaAba(user);
    expect(await screen.findByText("Saiu da aba")).toBeInTheDocument();
  });
});
