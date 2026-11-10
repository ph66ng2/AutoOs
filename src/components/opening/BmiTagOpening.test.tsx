import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BmiTagOpening,
  OPENING_EXIT_MS,
  OPENING_INTRO_MS,
  OPENING_REDUCED_INTRO_MS,
  OPENING_STATUS_DELAY_MS,
} from "@/components/opening/BmiTagOpening";

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("BmiTagOpening", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("mostra o nome da solução e um rótulo acessível único", () => {
    render(<BmiTagOpening product="AutoBO" />);
    expect(screen.getByText("AutoBO")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "AutoBO, BMI TAG" })).toBeInTheDocument();
  });

  it("com o app pronto, termina uma vez depois da abertura e da saída", () => {
    const onFinished = vi.fn();
    render(<BmiTagOpening product="AutoOS" ready onFinished={onFinished} />);
    advance(OPENING_INTRO_MS - 1);
    expect(screen.getByTestId("bmi-tag-opening")).not.toHaveClass("bto-root--exiting");
    advance(1);
    expect(screen.getByTestId("bmi-tag-opening")).toHaveClass("bto-root--exiting");
    expect(onFinished).not.toHaveBeenCalled();
    advance(OPENING_EXIT_MS);
    expect(onFinished).toHaveBeenCalledTimes(1);
    advance(10_000);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("não sai enquanto o app não está pronto e mostra o status sem repetir a leitura", () => {
    const onFinished = vi.fn();
    const { rerender } = render(
      <BmiTagOpening product="AutoOS" ready={false} status="Conectando" onFinished={onFinished} />,
    );
    advance(OPENING_INTRO_MS);
    advance(OPENING_STATUS_DELAY_MS - 1);
    expect(screen.queryByText("Conectando")).not.toBeInTheDocument();
    advance(1);
    expect(screen.getByText("Conectando")).toBeInTheDocument();
    advance(30_000);
    expect(onFinished).not.toHaveBeenCalled();

    rerender(<BmiTagOpening product="AutoOS" ready status="Conectando" onFinished={onFinished} />);
    advance(OPENING_EXIT_MS);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("não chama onFinished depois de desmontar", () => {
    const onFinished = vi.fn();
    const { unmount } = render(<BmiTagOpening product="AutoOS" onFinished={onFinished} />);
    advance(OPENING_INTRO_MS + 50);
    unmount();
    advance(10_000);
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("chama onFinished uma única vez sob StrictMode", () => {
    const onFinished = vi.fn();
    render(
      <StrictMode>
        <BmiTagOpening product="AutoOS" onFinished={onFinished} />
      </StrictMode>,
    );
    advance(OPENING_INTRO_MS);
    advance(OPENING_EXIT_MS + 1_000);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("com movimento reduzido, encurta a abertura", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const onFinished = vi.fn();
    render(<BmiTagOpening product="AutoOS" onFinished={onFinished} />);
    advance(OPENING_REDUCED_INTRO_MS);
    expect(onFinished).not.toHaveBeenCalled();
    advance(OPENING_EXIT_MS);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("no modo demonstração não agenda término", () => {
    const onFinished = vi.fn();
    render(<BmiTagOpening product="AutoOS" scripted onFinished={onFinished} />);
    advance(10_000);
    expect(onFinished).not.toHaveBeenCalled();
    expect(screen.getByTestId("bmi-tag-opening")).toHaveClass("bto-root--scripted");
  });
});
