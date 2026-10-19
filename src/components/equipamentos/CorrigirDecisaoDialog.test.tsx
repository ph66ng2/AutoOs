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
    ajustadoAposDecisao: false,
    permiteRestaurar: true,
    permiteManter: false,
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
      modo: "RESTAURAR_ORIGINAL",
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

  it("explica o bloqueio e não oferece a correção quando o atendimento já avançou", async () => {
    mocks.analisar.mockResolvedValue(analise({
      status: "EM_MANUTENCAO",
      podeCorrigir: false,
      permiteRestaurar: true,
      bloqueios: ["O atendimento já passou da decisão (etapa atual: EM_MANUTENCAO)."],
    }));
    abrir();

    expect(await screen.findByRole("alert")).toHaveTextContent(/etapa atual: EM_MANUTENCAO/);
    expect(screen.queryByRole("button", { name: "Reabrir orçamento" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("com ajuste depois da aprovação, oferece manter o orçamento atual (padrão) ou restaurar o enviado", async () => {
    mocks.analisar.mockResolvedValue(analise({
      ajustadoAposDecisao: true,
      permiteManter: true,
      pecasBaixadas: [],
      totalBaixado: 0,
      exigeDecisaoEstoque: false,
    }));
    mocks.corrigir.mockResolvedValue({});
    abrir();

    const manter = await screen.findByRole("radio", { name: /mantendo o orçamento atual/ });
    const restaurar = screen.getByRole("radio", { name: /Restaurar o orçamento enviado ao cliente/ });
    expect(manter).toBeChecked();
    expect(restaurar).not.toBeChecked();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Motivo da correção/), { target: { value: "Cliente quer rever o valor" } });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir orçamento" }));
    await waitFor(() => expect(mocks.corrigir).toHaveBeenCalledWith(expect.objectContaining({ modo: "MANTER_ATUAL" })));
  });

  it("avisa que o ajuste se perde ao restaurar o orçamento enviado", async () => {
    mocks.analisar.mockResolvedValue(analise({
      ajustadoAposDecisao: true,
      permiteManter: true,
      pecasBaixadas: [],
      totalBaixado: 0,
      exigeDecisaoEstoque: false,
    }));
    mocks.corrigir.mockResolvedValue({});
    abrir();

    fireEvent.click(await screen.findByRole("radio", { name: /Restaurar o orçamento enviado ao cliente/ }));
    expect(screen.getByRole("note")).toHaveTextContent(/será perdida/);

    fireEvent.change(screen.getByLabelText(/Motivo da correção/), { target: { value: "Voltar ao que o cliente viu" } });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir orçamento" }));
    await waitFor(() => expect(mocks.corrigir).toHaveBeenCalledWith(expect.objectContaining({ modo: "RESTAURAR_ORIGINAL" })));
  });

  it("sem a versão enviada guardada, só oferece manter o orçamento atual", async () => {
    mocks.analisar.mockResolvedValue(analise({
      permiteRestaurar: false,
      permiteManter: true,
      pecasBaixadas: [],
      totalBaixado: 0,
      exigeDecisaoEstoque: false,
    }));
    mocks.corrigir.mockResolvedValue({});
    abrir();

    expect(await screen.findByText(/não guardou a versão enviada ao cliente/)).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Motivo da correção/), { target: { value: "Aprovação por engano" } });
    fireEvent.click(screen.getByRole("button", { name: "Reabrir orçamento" }));
    await waitFor(() => expect(mocks.corrigir).toHaveBeenCalledWith(expect.objectContaining({ modo: "MANTER_ATUAL" })));
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
