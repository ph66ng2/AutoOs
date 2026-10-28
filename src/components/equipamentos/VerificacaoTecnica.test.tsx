import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificacaoTecnica } from "./VerificacaoTecnica";
import { MENSAGEM_TOTAL_ZERO_SEM_GARANTIA } from "@/lib/orcamento-estoque";

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
});
