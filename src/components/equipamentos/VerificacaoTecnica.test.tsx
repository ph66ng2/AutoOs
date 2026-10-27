import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VerificacaoTecnica } from "./VerificacaoTecnica";

vi.mock("@/lib/db", () => ({
  db: {
    listarServicos: vi.fn().mockResolvedValue([]),
    listarImagensEquipamento: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/orcamento-estoque", () => ({
  pecasParaOrcamento: () => [],
  validarPecas: () => true,
  carregarProdutosOrcamento: () => Promise.resolve([]),
  produtosSelecionaveisComoPeca: () => [],
}));

vi.mock("@/hooks/useNotification", () => ({
  useNotification: () => ({ warning: vi.fn() }),
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
});
