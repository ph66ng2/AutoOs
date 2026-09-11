import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PagamentoOrcamentoDialog } from "@/components/equipamentos/PagamentoOrcamentoDialog";

describe("PagamentoOrcamentoDialog", () => {
  it("exige forma de pagamento e detalhe para Outro", async () => {
    const onConfirm = vi.fn();
    render(<PagamentoOrcamentoDialog open onOpenChange={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/escolha uma forma/i);

    fireEvent.change(screen.getByLabelText("Forma de pagamento"), { target: { value: "OUTRO" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/descreva/i);
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Detalhe da forma de pagamento"), { target: { value: "Faturamento mensal" } });
    fireEvent.click(screen.getByRole("button", { name: /confirmar aprovação/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ codigo: "OUTRO", detalhe: "Faturamento mensal" }));
  });

  it("reapresenta pagamento existente e permite cancelar sem confirmar", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<PagamentoOrcamentoDialog
      open
      initialCodigo="PIX"
      initialDetalhe={null}
      onOpenChange={onOpenChange}
      onConfirm={onConfirm}
    />);

    expect(screen.getByRole("combobox")).toHaveValue("PIX");
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
