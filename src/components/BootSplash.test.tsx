import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BootSplash } from "@/components/BootSplash";
import { bootStatusLabel } from "@/components/AutoOsBootAnimation";

vi.mock("@/components/stamp/StampDemo", () => ({
  StampDemo: ({
    progress,
    mode,
    onComplete,
  }: {
    progress?: number;
    mode?: string;
    onComplete?: () => void;
  }) => (
    <div data-testid="stamp-loading" data-mode={mode} data-progress={progress ?? ""}>
      <div role="progressbar" aria-valuenow={Math.round(progress ?? 0)} />
      <img data-testid="boot-bmitag-logo" src="/bmi-tag-logo.png" alt="" />
      <button type="button" onClick={() => onComplete?.()}>
        finish-stamp
      </button>
    </div>
  ),
}));

describe("BootSplash stamp", () => {
  it("monta a animação stamp no modo loading com progresso real", () => {
    render(<BootSplash progress={38} fadeOut={false} />);

    const stamp = screen.getByTestId("stamp-loading");
    expect(stamp).toHaveAttribute("data-mode", "loading");
    expect(stamp).toHaveAttribute("data-progress", "38");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "38");
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("38 por cento"),
    );
  });

  it("mantém mensagens coerentes com as fases reais do carregamento", () => {
    expect(bootStatusLabel(6)).toBe("Iniciando o AutoOS");
    expect(bootStatusLabel(14)).toBe("Preparando etiquetas");
    expect(bootStatusLabel(28)).toBe("Verificando infraestrutura");
    expect(bootStatusLabel(62)).toBe("Sincronizando equipamentos");
    expect(bootStatusLabel(86)).toBe("Aplicando etiqueta");
    expect(bootStatusLabel(100)).toBe("Pronto");
  });

  it("encerra com a marca BMITAG sem recriar o nome AutoOS em texto", () => {
    render(<BootSplash progress={100} fadeOut={false} />);

    expect(screen.getByTestId("boot-bmitag-logo")).toBeInTheDocument();
    expect(screen.queryByText("AUTOOS")).not.toBeInTheDocument();
  });

  it("limita progresso inválido e propaga conclusão do stamp", async () => {
    const onStampComplete = vi.fn();
    const { rerender } = render(
      <BootSplash progress={-20} fadeOut={false} onStampComplete={onStampComplete} />,
    );
    expect(screen.getByTestId("stamp-loading")).toHaveAttribute("data-progress", "0");

    rerender(<BootSplash progress={140} fadeOut onStampComplete={onStampComplete} />);
    expect(screen.getByTestId("stamp-loading")).toHaveAttribute("data-progress", "100");

    screen.getByRole("button", { name: "finish-stamp" }).click();
    await waitFor(() => expect(onStampComplete).toHaveBeenCalledTimes(1));
  });
});
