import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  RELEASE_HIGHLIGHTS_STORAGE_KEY,
  RELEASE_HIGHLIGHTS_VERSION,
  ReleaseHighlightsDialog,
} from "@/components/ReleaseHighlightsDialog";

describe("ReleaseHighlightsDialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("exibe as novidades quando a sessão está pronta", () => {
    render(<ReleaseHighlightsDialog enabled />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Portal mais claro e orçamento sem retrabalho")).toBeInTheDocument();
    expect(screen.getByText("Portal mais claro")).toBeInTheDocument();
    expect(screen.getByText("Orçamento sem negociação")).toBeInTheDocument();
    expect(screen.getByText("Menu e orçamento de insumos mais claros")).toBeInTheDocument();
    expect(screen.getByText("Clientes e acesso ao portal")).toBeInTheDocument();
    for (const selo of ["Como chegar no portal", "OS em PDF", "Correção em 10 min", "Conexão mais estável"]) {
      expect(screen.getByText(selo)).toBeInTheDocument();
    }
    expect(screen.getByText(new RegExp(`Versão ${RELEASE_HIGHLIGHTS_VERSION.replace(/\./g, "\\.")}`))).toBeInTheDocument();
  });

  it("registra a confirmação e não reaparece na mesma versão", () => {
    const firstRender = render(<ReleaseHighlightsDialog enabled />);

    fireEvent.click(screen.getByRole("button", { name: "Começar a usar" }));

    expect(window.localStorage.getItem(RELEASE_HIGHLIGHTS_STORAGE_KEY)).toBe("seen");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    firstRender.unmount();
    render(<ReleaseHighlightsDialog enabled />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("espera a sessão estar pronta antes de aparecer", () => {
    const { rerender } = render(<ReleaseHighlightsDialog enabled={false} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(<ReleaseHighlightsDialog enabled />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
