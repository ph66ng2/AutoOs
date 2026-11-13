import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootSplash } from "@/components/BootSplash";
import { BOOT_ANIMATION_HARD_LIMIT_MS, BootUiProvider, useBootUi } from "@/components/BootUi";
import {
  OPENING_INTRO_MS,
  OPENING_STATUS_DELAY_MS,
} from "@/components/opening/BmiTagOpening";

function BootGateProbe() {
  const { bootAnimationComplete } = useBootUi();
  return <span data-testid="boot-gate">{bootAnimationComplete ? "liberado" : "bloqueado"}</span>;
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("BootSplash — abertura BMI TAG em toda inicialização", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("mostra a abertura BMI TAG mesmo que outra abertura já tenha rodado hoje", () => {
    // Chave da antiga "abertura do dia": não pode mais pular nada.
    window.localStorage.setItem("autoos:daily-boot-opening", new Date().toISOString().slice(0, 10));
    render(
      <BootUiProvider>
        <BootSplash progress={6} fadeOut={false} />
      </BootUiProvider>,
    );
    expect(screen.getByRole("status", { name: "Carregando aplicativo 6 por cento" })).toBeInTheDocument();
    expect(screen.getByTestId("bmi-tag-opening")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "BMI TAG" })).toBeInTheDocument();
  });

  it("libera o PIN e avisa o App uma vez, quando a logo termina de montar", () => {
    const onAnimationComplete = vi.fn();
    render(
      <BootUiProvider>
        <BootSplash progress={100} fadeOut={false} onAnimationComplete={onAnimationComplete} />
        <BootGateProbe />
      </BootUiProvider>,
    );
    advance(OPENING_INTRO_MS - 1);
    expect(screen.getByTestId("boot-gate")).toHaveTextContent("bloqueado");
    expect(onAnimationComplete).not.toHaveBeenCalled();
    advance(1);
    expect(screen.getByTestId("boot-gate")).toHaveTextContent("liberado");
    expect(onAnimationComplete).toHaveBeenCalledTimes(1);
    advance(10_000);
    expect(onAnimationComplete).toHaveBeenCalledTimes(1);
  });

  it("com carga lenta, mantém a logo parada e mostra um aviso discreto", () => {
    const { rerender } = render(
      <BootUiProvider>
        <BootSplash progress={38} fadeOut={false} />
      </BootUiProvider>,
    );
    advance(OPENING_INTRO_MS);
    advance(OPENING_STATUS_DELAY_MS);
    expect(screen.getByText("Iniciando o AutoOS")).toBeInTheDocument();

    rerender(
      <BootUiProvider>
        <BootSplash progress={100} fadeOut={false} />
      </BootUiProvider>,
    );
    expect(screen.queryByText("Iniciando o AutoOS")).not.toBeInTheDocument();
    expect(screen.getByTestId("bmi-tag-opening")).not.toHaveClass("bto-root--exiting");
  });

  it("sai quando o App libera o fade-out", () => {
    const { rerender } = render(
      <BootUiProvider>
        <BootSplash progress={100} fadeOut={false} />
      </BootUiProvider>,
    );
    advance(OPENING_INTRO_MS);
    rerender(
      <BootUiProvider>
        <BootSplash progress={140} fadeOut />
      </BootUiProvider>,
    );
    expect(screen.getByRole("status", { name: "Carregando aplicativo 100 por cento" })).toHaveClass("pointer-events-none");
    expect(screen.getByTestId("bmi-tag-opening")).toHaveClass("bto-root--exiting");
  });

  it("nunca segura o PIN além do limite de segurança", () => {
    render(
      <BootUiProvider>
        <BootGateProbe />
      </BootUiProvider>,
    );
    expect(screen.getByTestId("boot-gate")).toHaveTextContent("bloqueado");
    advance(BOOT_ANIMATION_HARD_LIMIT_MS);
    expect(screen.getByTestId("boot-gate")).toHaveTextContent("liberado");
  });
});
