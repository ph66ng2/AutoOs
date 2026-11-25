import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  hasPermission: vi.fn(() => true),
  navigate: vi.fn(),
  editor: {} as Record<string, unknown>,
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ hasPermission: mocks.hasPermission }) }));
vi.mock("@/hooks/useOrcamentoInsumosEditor", () => ({ useOrcamentoInsumosEditor: () => mocks.editor }));
vi.mock("@/components/equipamentos/ClienteSelector", () => ({ ClienteSelector: () => <div>seletor-cliente</div> }));
vi.mock("@/components/equipamentos/ContatoResponsavelSelector", () => ({ ContatoResponsavelSelector: () => <div>seletor-contato</div> }));
vi.mock("@/pages/insumos/OrcamentoInsumosItensEditor", () => ({ OrcamentoInsumosItensEditor: () => <div>editor-itens</div> }));
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

import VendaFormulario from "./VendaFormulario";

function editor(extra: Record<string, unknown> = {}) {
  const nada = () => undefined;
  return {
    detalhe: null, cliente: null, setCliente: nada, contato: null, setContato: nada, setAlterado: nada, linhas: [], setLinhas: nada,
    validade: "2026-11-30", setValidade: nada, observacoes: "", setObservacoes: nada, descontoNumero: 0, setDesconto: nada,
    alterado: false, carregando: false, ocupado: false, erro: null, status: null,
    totais: { subtotal: 0, desconto: 0, total: 0, descontoExcedido: false }, faltas: [], editavel: true, podeSalvar: false,
    motivoSemSalvar: "Escolha o cliente para salvar.", salvar: vi.fn(), editar: () => nada,
    ...extra,
  };
}

function renderEm(caminho: string) {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="/vendas/novo" element={<VendaFormulario />} />
        <Route path="/vendas/:id/editar" element={<VendaFormulario />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("VendaFormulario (/vendas/novo e /vendas/:id/editar)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPermission.mockReturnValue(true);
  });

  it("novo: título, seções e o motivo de não poder salvar ainda", () => {
    mocks.editor = editor();
    renderEm("/vendas/novo");
    expect(screen.getByRole("heading", { name: "Novo orçamento" })).toBeInTheDocument();
    expect(screen.getByText("Escolha o cliente para salvar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvar orçamento" })).toBeDisabled();
  });

  it("bloqueia a edição quando o orçamento carregado pertence a outra rota", () => {
    mocks.editor = editor({
      detalhe: { id: 34, numero_exibicao: "OI-34", status: "RASCUNHO" },
      podeSalvar: true,
    });
    renderEm("/vendas/35/editar");
    expect(screen.getByRole("alert")).toHaveTextContent("Orçamento não encontrado.");
    expect(screen.queryByRole("button", { name: "Salvar orçamento" })).not.toBeInTheDocument();
  });

  it("editar um enviado avisa que volta para Rascunho; salvar vai para a página do orçamento", async () => {
    const salvar = vi.fn().mockResolvedValue({ id: 34 });
    mocks.editor = editor({
      detalhe: { id: 34, numero_exibicao: "OI-34", status: "ENVIADO", empresa_id: 1 },
      status: "ENVIADO",
      alterado: true,
      podeSalvar: true,
      motivoSemSalvar: null,
      salvar,
    });
    renderEm("/vendas/34/editar");
    expect(screen.getByText("Este orçamento já foi enviado")).toBeInTheDocument();
    expect(screen.getByText("Alterações não salvas")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Salvar orçamento" }));
    expect(salvar).toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/vendas/34");
  });

  it("salvar recusado (PIN ou erro) não sai da página; descartar pergunta e volta ao orçamento", async () => {
    const salvar = vi.fn().mockResolvedValue(null);
    mocks.editor = editor({
      detalhe: { id: 34, numero_exibicao: "OI-34", status: "RASCUNHO", empresa_id: 1 },
      status: "RASCUNHO", alterado: true, podeSalvar: true, motivoSemSalvar: null, salvar,
    });
    const usuario = userEvent.setup();
    renderEm("/vendas/34/editar");
    await usuario.click(screen.getByRole("button", { name: "Salvar orçamento" }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    await usuario.click(screen.getByRole("button", { name: /Descartar alterações/ }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    expect(mocks.navigate).not.toHaveBeenCalled();
    await usuario.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/vendas/34");
    expect(salvar).toHaveBeenCalledOnce();
  });

  it("Esc sem alterações volta ao orçamento como o botão Voltar (Esc)", async () => {
    mocks.editor = editor({ detalhe: { id: 34, numero_exibicao: "OI-34", status: "RASCUNHO", empresa_id: 1 }, status: "RASCUNHO" });
    renderEm("/vendas/34/editar");
    await userEvent.setup().keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mocks.navigate).toHaveBeenCalledWith("/vendas/34");
  });

  it("Esc com alterações pergunta antes, mesmo sem o bloqueio do roteador; continuar fica, sair volta sem salvar", async () => {
    const salvar = vi.fn();
    mocks.editor = editor({
      detalhe: { id: 34, numero_exibicao: "OI-34", status: "RASCUNHO", empresa_id: 1 },
      status: "RASCUNHO", alterado: true, podeSalvar: true, motivoSemSalvar: null, salvar,
    });
    const usuario = userEvent.setup();
    renderEm("/vendas/34/editar");
    await usuario.keyboard("{Escape}");
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await usuario.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(mocks.navigate).not.toHaveBeenCalled();
    await usuario.keyboard("{Escape}");
    await usuario.click(await screen.findByRole("button", { name: "Sair sem salvar" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/vendas/34");
    expect(salvar).not.toHaveBeenCalled();
  });

  it("aprovado não pode ser editado; sem Ações financeiras não abre o formulário", () => {
    mocks.editor = editor({ detalhe: { id: 34, numero_exibicao: "OI-34", status: "APROVADO" }, status: "APROVADO", editavel: false });
    const { unmount } = renderEm("/vendas/34/editar");
    expect(screen.getByText(/está aprovado e não pode mais ser editado/)).toBeInTheDocument();
    unmount();
    mocks.hasPermission.mockReturnValue(false);
    mocks.editor = editor();
    renderEm("/vendas/novo");
    expect(screen.getByText(/troque para um perfil com/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar orçamento" })).not.toBeInTheDocument();
  });
});
