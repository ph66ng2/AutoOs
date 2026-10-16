import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CorrigirDecisaoDialog } from "@/components/equipamentos/CorrigirDecisaoDialog";
import type { AnaliseCorrecaoDecisao, Equipamento } from "@/types";

const mocks = vi.hoisted(() => ({ analisar: vi.fn(), corrigir: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { analisarCorrecaoDecisao: mocks.analisar, corrigirDecisaoOrcamento: mocks.corrigir },
}));

const equipamento = { id: 5, status: "APROVADO", atualizado_em: "2026-10-14T10:00:00Z" } as Equipamento;

function analise(overrides: Partial<AnaliseCorrecaoDecisao> = {}): AnaliseCorrecaoDecisao {
  return {
    status: "APROVADO",
    podeCorrigir: true,
    bloqueios: [],
    pagamentoCodigo: "PIX",
    valorAtual: 50,
    valorOriginal: 90,
    pecasBaixadas: [{ produtoId: 1, nome: "Cabeça", quantidade: 3 }],
    totalBaixado: 3,
    exigeDecisaoEstoque: true,
    ...overrides,
  };
}

function abrir(onCorrigido = vi.fn(), onOpenChange = vi.fn()) {
  render(<CorrigirDecisaoDialog equipamento={equipamento} open onOpenChange={onOpenChange} onCorrigido={onCorrigido} />);
  return { onCorrigido, onOpenChange };
}

beforeEach(() => vi.clearAllMocks());

describe("CorrigirDecisaoDialog", () => {
  it("exige motivo e confirmação explícita da devolução ao estoque", async () => {
    mocks.analisar.mockResolvedValue(analise());
    mocks.corrigir.mockResolvedValue({});
    const { onCorrigido } = abrir();

    const botao = await screen.findByRole("button", { name: "Reabrir orçamento" });
    expect(screen.getByText("3 × Cabeça")).toBeInTheDocument();
    expect(botao).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Motivo da correção/), { target: { value: "Cliente pediu para refazer" } });
    expect(botao).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(botao).toBeEnabled();
    fireEvent.click(botao);

    await waitFor(() => expect(mocks.corrigir).toHaveBeenCalledWith({
      equipamento_id: 5,
      expected_updated_em: "2026-10-14T10:00:00Z",
      motivo: "Cliente pediu para refazer",
      devolver_estoque: true,
    }));
    await waitFor(() => expect(onCorrigido).toHaveBeenCalled());
  });

  it("não pede decisão de estoque quando nada foi baixado", async () => {
    mocks.analisar.mockResolvedValue(analise({ pecasBaixadas: [], totalBaixado: 0, exigeDecisaoEstoque: false }));
    abrir();

    const botao = await screen.findByRole("button", { name: "Reabrir orçamento" });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Motivo da correção/), { target: { value: "Aprovação por engano" } });
    expect(botao).toBeEnabled();
  });

  it("encaminha para atendimento humano quando há bloqueio", async () => {
    mocks.analisar.mockResolvedValue(analise({
      status: "EM_MANUTENCAO",
      podeCorrigir: false,
      bloqueios: ["O atendimento já passou da decisão. A correção exige atendimento humano."],
    }));
    abrir();

    expect(await screen.findByRole("alert")).toHaveTextContent(/atendimento humano/);
    expect(screen.queryByRole("button", { name: "Reabrir orçamento" })).not.toBeInTheDocument();
  });

  it("mostra o erro do backend sem fechar o diálogo", async () => {
    mocks.analisar.mockResolvedValue(analise({ pecasBaixadas: [], totalBaixado: 0, exigeDecisaoEstoque: false }));
    mocks.corrigir.mockRejectedValue("O equipamento foi alterado por outra pessoa.");
    const { onOpenChange, onCorrigido } = abrir();

    fireEvent.change(await screen.findByLabelText(/Motivo da correção/), { target: { value: "Aprovação por engano" } });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir orçamento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/alterado por outra pessoa/);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onCorrigido).not.toHaveBeenCalled();
  });
});
