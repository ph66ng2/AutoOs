import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BootSplash } from "@/components/BootSplash";
import { bootStatusLabel } from "@/components/AutoOsBootAnimation";
import { BOOT_ANIMATION_HARD_LIMIT_MS, BootUiProvider, useBootUi } from "@/components/BootUi";
import { DAILY_BOOT_OPENING_STORAGE_KEY } from "@/lib/daily-boot-opening";
import { todayLocalIsoDate } from "@/lib/date-utils";

const stamp = vi.hoisted(() => ({ complete: null as null | (() => void) }));

vi.mock("@/components/stamp/StampDemo", () => ({
  StampDemo: ({ onComplete }: { onComplete?: () => void }) => {
    stamp.complete = onComplete ?? null;
    return <div data-testid="stamp-demo" />;
  },
}));

function renderSplash(ui: React.ReactElement) {
  return render(<BootUiProvider>{ui}</BootUiProvider>);
}

describe("BootSplash vetorial (impressora)", () => {
  beforeEach(() => {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, todayLocalIsoDate());
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("desenha a impressora e mostra barra de progresso acompanhando o boot", () => {
    const { container } = renderSplash(<BootSplash progress={38} fadeOut={false} />);

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Progresso da inicialização" });
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(38);
    expect(screen.queryByTestId("boot-opening-stamp")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Carregando aplicativo 38 por cento",
    );
  });

  it("mantém mensagens coerentes com as fases reais do carregamento", () => {
    expect(bootStatusLabel(6)).toBe("Iniciando o AutoOS");
    expect(bootStatusLabel(14)).toBe("Carregando módulos");
    expect(bootStatusLabel(38)).toBe("Preparando sua sessão");
    expect(bootStatusLabel(86)).toBe("Finalizando o atendimento");
    expect(bootStatusLabel(100)).toBe("Tudo pronto");
  });

  it("desenha até o fim, encerra com a marca BMITAG e avisa que terminou", async () => {
    const onAnimationComplete = vi.fn();
    renderSplash(<BootSplash progress={100} fadeOut={false} onAnimationComplete={onAnimationComplete} />);

    expect(await screen.findByTestId("boot-bmitag-logo", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText("AUTOOS")).not.toBeInTheDocument();
    await waitFor(() => expect(onAnimationComplete).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("limita progresso inválido antes de atualizar o desenho", () => {
    const { rerender } = renderSplash(<BootSplash progress={-20} fadeOut={false} />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Carregando aplicativo 0 por cento",
    );

    rerender(<BootUiProvider><BootSplash progress={140} fadeOut /></BootUiProvider>);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Carregando aplicativo 100 por cento",
    );
  });
});

describe("BootSplash — abertura do dia", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("primeira abertura do dia mostra o carimbo BMITAG antes da impressora", () => {
    window.localStorage.removeItem(DAILY_BOOT_OPENING_STORAGE_KEY);
    renderSplash(<BootSplash progress={38} fadeOut={false} />);

    expect(screen.getByTestId("boot-opening-stamp")).toBeInTheDocument();
    expect(screen.queryByTestId("printer-outline")).not.toBeInTheDocument();
  });

  it("depois do carimbo segue para a impressora e grava o dia", async () => {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, "2000-01-01");
    renderSplash(<BootSplash progress={38} fadeOut={false} />);
    expect(screen.getByTestId("stamp-demo")).toBeInTheDocument();

    act(() => stamp.complete?.());

    await waitFor(() => expect(screen.getByTestId("printer-outline")).toBeInTheDocument());
    expect(screen.queryByTestId("boot-opening-stamp")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DAILY_BOOT_OPENING_STORAGE_KEY)).toBe(todayLocalIsoDate());
  });
});

function BootGateProbe() {
  const { bootAnimationComplete } = useBootUi();
  return <span data-testid="boot-gate">{bootAnimationComplete ? "liberado" : "bloqueado"}</span>;
}

describe("BootUi — PIN só depois da animação", () => {
  beforeEach(() => {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, todayLocalIsoDate());
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("libera o PIN só quando a impressora termina", async () => {
    render(
      <BootUiProvider>
        <BootSplash progress={100} fadeOut={false} />
        <BootGateProbe />
      </BootUiProvider>,
    );

    expect(screen.getByTestId("boot-gate")).toHaveTextContent("bloqueado");
    await waitFor(() => expect(screen.getByTestId("boot-gate")).toHaveTextContent("liberado"), {
      timeout: 5000,
    });
  });

  it("nunca segura o PIN além do limite de segurança", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    render(
      <BootUiProvider>
        <BootGateProbe />
      </BootUiProvider>,
    );
    expect(screen.getByTestId("boot-gate")).toHaveTextContent("bloqueado");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BOOT_ANIMATION_HARD_LIMIT_MS);
    });

    expect(screen.getByTestId("boot-gate")).toHaveTextContent("liberado");
  });
});

describe("BootSplash — janela minimizada", () => {
  afterEach(() => {
    window.localStorage.clear();
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("termina a impressora mesmo sem requestAnimationFrame rodando", async () => {
    window.localStorage.setItem(DAILY_BOOT_OPENING_STORAGE_KEY, todayLocalIsoDate());
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    const onAnimationComplete = vi.fn();
    try {
      renderSplash(<BootSplash progress={100} fadeOut={false} onAnimationComplete={onAnimationComplete} />);

      expect(await screen.findByTestId("boot-bmitag-logo")).toBeInTheDocument();
      await waitFor(() => expect(onAnimationComplete).toHaveBeenCalledTimes(1), { timeout: 3000 });
    } finally {
      raf.mockRestore();
    }
  });
});
