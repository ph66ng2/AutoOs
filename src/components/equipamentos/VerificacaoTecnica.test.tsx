import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificacaoTecnica } from "./VerificacaoTecnica";
import { MENSAGEM_TOTAL_ZERO_SEM_GARANTIA } from "@/lib/orcamento-estoque";
import { semearTecnicosPadrao } from "@/test/tecnicos-fixture";
import { useState } from "react";
import { createMemoryRouter, RouterProvider, useNavigate } from "react-router-dom";
import { useAvisoAoSair } from "@/hooks/useAvisoAoSair";

beforeEach(() => semearTecnicosPadrao());

const warning = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    listarServicos: vi.fn().mockResolvedValue([]),
    listarImagensEquipamento: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/orcamento-estoque", async () => {
  const actual = await vi.importActual<typeof import("@/lib/orcamento-estoque")>("@/lib/orcamento-estoque");
  return {
    ...actual,
    pecasParaOrcamento: () => [],
    validarPecas: () => true,
    carregarProdutosOrcamento: () => Promise.resolve([]),
    produtosSelecionaveisComoPeca: () => [],
  };
});

vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ warning }),
}));

vi.mock("@/components/equipamentos/PhotoUploadDialog", () => ({
  PhotoUploadDialog: () => null,
}));

describe("VerificacaoTecnica", () => {
  it("não deixa finalizar serviço com valor inválido", async () => {
    const user = userEvent.setup();
    render(
      <VerificacaoTecnica
        equipamento={{
          id: 1,
          marca: "Zebra",
          modelo: "ZT230",
          serial_number: "SN",
          tipo: "Impressora",
          status: "EM_VERIFICACAO",
          data_entrada: "2026-10-01",
        } as never}
        open
        onOpenChange={vi.fn()}
        onConcluir={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    const campo = screen.getByLabelText("Valor do serviço");
    await user.clear(campo);
    await user.paste("abc");
    expect(screen.getByText("Informe um valor válido.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Finalizar Verificação/i })).toBeDisabled();
  });

  const equipamento = {
    id: 1,
    marca: "Zebra",
    modelo: "ZT230",
    serial_number: "SN",
    tipo: "Impressora",
    status: "EM_VERIFICACAO",
    data_entrada: "2026-10-01",
  } as never;

  it("bloqueia finalizar com total 0 sem itens de garantia e não chama onConcluir", async () => {
    const onConcluir = vi.fn();
    render(
      <VerificacaoTecnica
        equipamento={equipamento}
        open
        onOpenChange={vi.fn()}
        onConcluir={onConcluir}
      />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /Finalizar Verificação/i }));
    expect(warning).toHaveBeenCalledWith("Verificação", MENSAGEM_TOTAL_ZERO_SEM_GARANTIA);
    expect(onConcluir).not.toHaveBeenCalled();
  });

  it("finaliza OS só de garantia com total 0 só depois de confirmar garantia", async () => {
    const user = userEvent.setup();
    const onConcluir = vi.fn().mockResolvedValue(true);
    render(
      <VerificacaoTecnica
        equipamento={equipamento}
        open
        onOpenChange={vi.fn()}
        onConcluir={onConcluir}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    await user.type(screen.getByPlaceholderText("Nome do serviço"), "Atendimento em garantia");
    expect(screen.queryByText(/^Garantia$/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Finalizar Verificação/i }));
    expect(onConcluir).not.toHaveBeenCalled();
    expect(screen.getByText("Confirmar OS só de garantia?")).toBeInTheDocument();
    const cancelar = screen.getAllByRole("button", { name: "Cancelar" });
    await user.click(cancelar[cancelar.length - 1]);
    expect(onConcluir).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Finalizar Verificação/i }));
    await user.click(screen.getByRole("button", { name: "Confirmar garantia" }));
    expect(onConcluir).toHaveBeenCalledWith(expect.objectContaining({
      custo_total: 0,
      concluida: true,
      confirmar_garantia: true,
    }));
  });

  it("abre verificação de outro equipamento com formulário limpo depois de Quem recebe", async () => {
    const user = userEvent.setup();
    const onConcluir = vi.fn().mockResolvedValue(false);
    const onOpenChange = vi.fn();
    const equipamentoA = { ...equipamento, id: 1, marca: "Zebra", modelo: "ZT230" };
    const equipamentoB = { ...equipamento, id: 2, marca: "Honeywell", modelo: "PC43" };

    const { rerender } = render(
      <VerificacaoTecnica
        equipamento={equipamentoA as never}
        open
        onOpenChange={onOpenChange}
        onConcluir={onConcluir}
      />,
    );

    await user.type(
      screen.getByPlaceholderText(/Descreva o diagnóstico/),
      "Falha no cabeçote do equipamento A",
    );
    await user.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    await user.type(screen.getByPlaceholderText("Nome do serviço"), "Troca de cabeçote");
    const campoValor = screen.getByLabelText("Valor do serviço");
    await user.clear(campoValor);
    await user.paste("10,00");
    await user.click(screen.getByRole("button", { name: /Finalizar Verificação/i }));

    await waitFor(() => expect(onConcluir).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("Falha no cabeçote do equipamento A")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Troca de cabeçote")).toBeInTheDocument();

    rerender(
      <VerificacaoTecnica
        equipamento={equipamentoA as never}
        open={false}
        onOpenChange={onOpenChange}
        onConcluir={onConcluir}
      />,
    );
    rerender(
      <VerificacaoTecnica
        equipamento={equipamentoB as never}
        open
        onOpenChange={onOpenChange}
        onConcluir={onConcluir}
      />,
    );

    expect(screen.getByText("Honeywell PC43")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Descreva o diagnóstico/)).toHaveValue("");
    expect(screen.queryByDisplayValue("Falha no cabeçote do equipamento A")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("Troca de cabeçote")).not.toBeInTheDocument();
    expect(screen.getByText("Nenhum serviço adicionado.")).toBeInTheDocument();
  });
  it("salva o checklist marcado e mostra os custos enquanto digita", async () => {
    const user = userEvent.setup();
    const onConcluir = vi.fn().mockResolvedValue(true);
    render(
      <VerificacaoTecnica
        equipamento={equipamento}
        open
        onOpenChange={vi.fn()}
        onConcluir={onConcluir}
      />,
    );
    expect(screen.getByText("0 de 7")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Teste de impressão" }));
    await user.click(screen.getByRole("checkbox", { name: "Limpeza interna" }));
    expect(screen.getByText("2 de 7")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
    await user.type(screen.getByPlaceholderText("Nome do serviço"), "Limpeza da cabeça");
    const campoValor = screen.getByLabelText("Valor do serviço");
    await user.clear(campoValor);
    await user.paste("120,00");
    const custos = screen.getByRole("region", { name: "Custos" });
    expect(within(custos).getAllByText("R$ 120,00").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /Finalizar Verificação/i }));
    await waitFor(() => expect(onConcluir).toHaveBeenCalled());
    const itens = JSON.parse(onConcluir.mock.calls[0][0].itens_verificados) as { nome: string; verificado: boolean }[];
    expect(itens).toHaveLength(7);
    expect(itens.filter((item) => item.verificado).map((item) => item.nome)).toEqual(["Teste de impressão", "Limpeza interna"]);
    expect(onConcluir.mock.calls[0][0].custo_total).toBe(120);
  });

  it("sem permissão de orçamento a página abre e avisa quem pode finalizar", () => {
    render(<VerificacaoTecnica equipamento={equipamento} open onOpenChange={vi.fn()} onConcluir={vi.fn()} podeFinalizar={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("Finalizar pede o PIN de quem tem Ações financeiras ou Elaborar e enviar orçamentos.");
    expect(screen.getByRole("button", { name: /Finalizar Verificação/i })).toBeInTheDocument();
  });

  it("no celular cada serviço vira uma linha que abre a edição", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((consulta: string) => ({ matches: false, media: consulta, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      render(<VerificacaoTecnica equipamento={equipamento} open onOpenChange={vi.fn()} onConcluir={vi.fn()} />);
      await user.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
      await user.type(screen.getByPlaceholderText("Nome do serviço"), "Limpeza");
      await user.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
      const linha = screen.getByRole("button", { name: "Editar serviço Limpeza" });
      expect(linha).toHaveClass("min-h-11");
      expect(screen.getAllByPlaceholderText("Nome do serviço").filter((campo) => campo.closest("[hidden]") == null)).toHaveLength(1);
      await user.click(linha);
      expect(screen.getByDisplayValue("Limpeza").closest("[hidden]")).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });

  it("no celular, recolher um serviço com valor inválido mantém o erro visível ao reabrir", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((consulta: string) => ({ matches: false, media: consulta, addEventListener: () => undefined, removeEventListener: () => undefined })) as unknown as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      render(<VerificacaoTecnica equipamento={equipamento} open onOpenChange={vi.fn()} onConcluir={vi.fn()} />);
      await user.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
      await user.type(screen.getByPlaceholderText("Nome do serviço"), "Limpeza");
      const campo = screen.getByLabelText("Valor do serviço");
      await user.clear(campo);
      await user.paste("abc");
      await user.click(screen.getByRole("button", { name: /Adicionar Serviço/i }));
      await user.click(screen.getByRole("button", { name: "Editar serviço Limpeza" }));
      expect(screen.getByText("Informe um valor válido.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Finalizar Verificação/i })).toBeDisabled();
    } finally {
      window.matchMedia = original;
    }
  });

  it("trocar só o técnico já conta como verificação preenchida", async () => {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.scrollIntoView = () => undefined;
    const user = userEvent.setup();
    const onSujoChange = vi.fn();
    render(
      <VerificacaoTecnica
        equipamento={{ id: 1, marca: "Zebra", modelo: "ZT230", serial_number: "SN", tipo: "Impressora", status: "EM_VERIFICACAO", data_entrada: "2026-10-01" } as never}
        open
        onOpenChange={vi.fn()}
        onConcluir={vi.fn()}
        tecnicoInicial="Ivan"
        onSujoChange={onSujoChange}
      />,
    );
    await waitFor(() => expect(onSujoChange).toHaveBeenLastCalledWith(false));
    await user.click(screen.getByLabelText("Técnico responsável"));
    await user.click(await screen.findByRole("option", { name: "Isaias" }));
    await waitFor(() => expect(onSujoChange).toHaveBeenLastCalledWith(true));
  });
});

// Mesma ligação de Equipamentos.tsx: a seta de voltar vai para `onVoltar`, que com algo
// preenchido navega pelo bloqueio "Sair sem salvar?" e, limpo, fecha a página direto.
function PaginaVerificacaoComAviso({ onOpenChange }: { onOpenChange: (aberta: boolean) => void }) {
  const [sujo, setSujo] = useState(false);
  const [aberta, setAberta] = useState(true);
  const navigate = useNavigate();
  const aviso = useAvisoAoSair(aberta && sujo);
  const fechar = () => {
    setAberta(false);
    onOpenChange(false);
    navigate("/equipamentos");
  };
  return (
    <>
      <VerificacaoTecnica
        equipamento={{ id: 1, marca: "Zebra", modelo: "ZT230", serial_number: "SN", tipo: "Impressora", status: "EM_VERIFICACAO", data_entrada: "2026-10-01" } as never}
        open={aberta}
        onOpenChange={(valor) => { if (!valor) fechar(); }}
        onConcluir={vi.fn()}
        onSujoChange={setSujo}
        onVoltar={() => (sujo ? navigate("/equipamentos") : fechar())}
      />
      {aviso.dialogo}
    </>
  );
}

function montarComAviso() {
  const onOpenChange = vi.fn();
  const router = createMemoryRouter(
    [
      { path: "/equipamentos/1/verificacao", element: <PaginaVerificacaoComAviso onOpenChange={onOpenChange} /> },
      { path: "/equipamentos", element: <p>Lista de equipamentos</p> },
    ],
    { initialEntries: ["/equipamentos/1/verificacao"] },
  );
  render(<RouterProvider router={router} />);
  return { router, onOpenChange };
}

describe("VerificacaoTecnica — seta de voltar", () => {
  it("preenchida: pergunta antes; continuar editando mantém o diagnóstico", async () => {
    const user = userEvent.setup();
    const { router, onOpenChange } = montarComAviso();
    await user.type(screen.getByLabelText("Diagnóstico técnico"), "Cabeça gasta");
    await user.click(screen.getByRole("button", { name: /Zebra ZT230 · SN/ }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Sair sem salvar?");
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(router.state.location.pathname).toBe("/equipamentos/1/verificacao");
    expect(screen.getByLabelText("Diagnóstico técnico")).toHaveValue("Cabeça gasta");
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("preenchida: sair sem salvar descarta e navega", async () => {
    const user = userEvent.setup();
    const { router } = montarComAviso();
    await user.type(screen.getByLabelText("Diagnóstico técnico"), "Cabeça gasta");
    await user.click(screen.getByRole("button", { name: /Zebra ZT230 · SN/ }));
    await user.click(await screen.findByRole("button", { name: "Sair sem salvar" }));
    expect(await screen.findByText("Lista de equipamentos")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/equipamentos");
  });

  it("limpa: volta sem perguntar", async () => {
    const user = userEvent.setup();
    const { router, onOpenChange } = montarComAviso();
    await user.click(screen.getByRole("button", { name: /Zebra ZT230 · SN/ }));
    expect(await screen.findByText("Lista de equipamentos")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(router.state.location.pathname).toBe("/equipamentos");
  });

  it("sem onVoltar, a seta fecha como o Cancelar", async () => {
    const onOpenChange = vi.fn();
    render(
      <VerificacaoTecnica equipamento={{ id: 1, marca: "Zebra", modelo: "ZT230", serial_number: "SN" } as never} open onOpenChange={onOpenChange} onConcluir={vi.fn()} />,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /Zebra ZT230 · SN/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("com onVoltar, a seta não limpa o formulário nem fecha a página", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onVoltar = vi.fn();
    render(
      <VerificacaoTecnica equipamento={{ id: 1, marca: "Zebra", modelo: "ZT230", serial_number: "SN" } as never} open onOpenChange={onOpenChange} onConcluir={vi.fn()} onVoltar={onVoltar} />,
    );
    await user.type(screen.getByLabelText("Diagnóstico técnico"), "Rolete");
    await user.click(screen.getByRole("button", { name: /Zebra ZT230 · SN/ }));
    expect(onVoltar).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Diagnóstico técnico")).toHaveValue("Rolete");
  });
});
