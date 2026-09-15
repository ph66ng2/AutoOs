import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BootSplash } from "@/components/BootSplash";
import { bootStatusLabel } from "@/components/AutoOsBootAnimation";

describe("BootSplash vetorial", () => {
  it("usa o SVG como progresso sem imagem ou barra tradicional", () => {
    const { container } = render(<BootSplash progress={38} fadeOut={false} />);

    expect(container.querySelector("svg")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(container.querySelector('[role="progressbar"]')).not.toBeInTheDocument();
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

  it("limita progresso inválido antes de atualizar o desenho", () => {
    const { rerender } = render(<BootSplash progress={-20} fadeOut={false} />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Carregando aplicativo 0 por cento",
    );

    rerender(<BootSplash progress={140} fadeOut />);
    expect(screen.getByRole("status")).toHaveAttribute(
      "aria-label",
      "Carregando aplicativo 100 por cento",
    );
  });
});
