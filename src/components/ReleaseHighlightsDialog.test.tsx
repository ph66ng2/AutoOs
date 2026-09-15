import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  RELEASE_HIGHLIGHTS_STORAGE_KEY,
  ReleaseHighlightsDialog,
} from "@/components/ReleaseHighlightsDialog";

describe("ReleaseHighlightsDialog", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("exibe as novidades quando a sessão está pronta", () => {
    render(<ReleaseHighlightsDialog enabled />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Um AutoOS mais completo para o atendimento")).toBeInTheDocument();
    expect(screen.getByText("Contatos e responsáveis")).toBeInTheDocument();
    expect(screen.getByText("Orçamentos mais seguros")).toBeInTheDocument();
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
