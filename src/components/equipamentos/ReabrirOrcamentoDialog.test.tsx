import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReabrirOrcamentoDialog } from "@/components/equipamentos/ReabrirOrcamentoDialog";

function abrir() {
  const onOpenChange = vi.fn();
  const onCorrigirEngano = vi.fn();
  const onNovaProposta = vi.fn();
  render(
    <ReabrirOrcamentoDialog
      open
      onOpenChange={onOpenChange}
      onCorrigirEngano={onCorrigirEngano}
      onNovaProposta={onNovaProposta}
    />,
  );
  return { onOpenChange, onCorrigirEngano, onNovaProposta };
}

describe("ReabrirOrcamentoDialog", () => {
  it("mostra as duas opções com a explicação de cada uma", () => {
    abrir();
    expect(screen.getByText("Reabrir orçamento")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Foi um engano \(corrigir a decisão\)/ })).toBeInTheDocument();
    expect(screen.getByText("Desfaz a reprovação registrada por engano; pagamento, serviços e estoque são conferidos.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nova proposta/ })).toBeInTheDocument();
    expect(screen.getByText("Volta para Aguardando aprovação para enviar o orçamento de novo.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("corrigir o engano fecha o diálogo e chama só essa ação", () => {
    const { onOpenChange, onCorrigirEngano, onNovaProposta } = abrir();
    fireEvent.click(screen.getByRole("button", { name: /Foi um engano/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCorrigirEngano).toHaveBeenCalledTimes(1);
    expect(onNovaProposta).not.toHaveBeenCalled();
  });

  it("nova proposta fecha o diálogo e chama só essa ação", () => {
    const { onOpenChange, onCorrigirEngano, onNovaProposta } = abrir();
    fireEvent.click(screen.getByRole("button", { name: /Nova proposta/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onNovaProposta).toHaveBeenCalledTimes(1);
    expect(onCorrigirEngano).not.toHaveBeenCalled();
  });

  it("cancelar só fecha o diálogo", () => {
    const { onOpenChange, onCorrigirEngano, onNovaProposta } = abrir();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCorrigirEngano).not.toHaveBeenCalled();
    expect(onNovaProposta).not.toHaveBeenCalled();
  });
});
