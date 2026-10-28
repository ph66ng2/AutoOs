import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("finaliza OS só de garantia com total 0", async () => {
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
    expect(onConcluir).toHaveBeenCalledWith(expect.objectContaining({
      custo_total: 0,
      concluida: true,
    }));
  });
});
