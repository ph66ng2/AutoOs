import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfPreviewDialog } from "./PdfPreviewDialog";

const artifact = {
  filename: "ordem.pdf",
  bytes: new Uint8Array([37, 80, 68, 70]),
  mimeType: "application/pdf" as const,
};

describe("PdfPreviewDialog", () => {
  const focus = vi.fn();
  const print = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:ordem.pdf"),
      revokeObjectURL: vi.fn(),
    });
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      configurable: true,
      get: () => ({ focus, print }),
    });
  });

  afterEach(() => {
    focus.mockReset();
    print.mockReset();
    vi.unstubAllGlobals();
  });

  it("só permite imprimir depois de carregar a prévia e imprime o PDF do iframe", async () => {
    render(<PdfPreviewDialog artifact={artifact} onOpenChange={vi.fn()} />);

    const printButton = screen.getByRole("button", { name: "Imprimir" });
    expect(printButton).toBeDisabled();

    fireEvent.load(screen.getByTitle("Prévia do PDF"));
    expect(printButton).toBeEnabled();
    fireEvent.click(printButton);

    await waitFor(() => expect(focus).toHaveBeenCalledTimes(1));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("mostra o prazo só quando a prévia é de orçamento", () => {
    const { rerender } = render(<PdfPreviewDialog artifact={artifact} onOpenChange={vi.fn()} />);
    expect(screen.queryByLabelText("Prazo mínimo em dias úteis")).not.toBeInTheDocument();

    rerender(
      <PdfPreviewDialog
        artifact={artifact}
        onOpenChange={vi.fn()}
        prazoExecucao={{ minDiasUteis: 2, maxDiasUteis: 4, onChange: vi.fn() }}
      />,
    );
    expect(screen.getByLabelText("Prazo mínimo em dias úteis")).toHaveValue(2);
    expect(screen.getByLabelText("Prazo máximo em dias úteis")).toHaveValue(4);
  });

  it("aplica o prazo ao sair do campo", async () => {
    const onChange = vi.fn();
    render(
      <PdfPreviewDialog
        artifact={artifact}
        onOpenChange={vi.fn()}
        prazoExecucao={{ minDiasUteis: 2, maxDiasUteis: 4, onChange }}
      />,
    );

    const minimo = screen.getByLabelText("Prazo mínimo em dias úteis");
    fireEvent.change(minimo, { target: { value: "5" } });
    fireEvent.blur(minimo);
    const maximo = screen.getByLabelText("Prazo máximo em dias úteis");
    fireEvent.change(maximo, { target: { value: "8" } });
    fireEvent.blur(maximo);

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange).toHaveBeenLastCalledWith(5, 8);
  });
});
