import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CarregandoSkeleton, Skeleton, SkeletonTabela } from "./skeleton";

describe("Skeleton", () => {
  it("é decorativo e para o pulso com movimento reduzido", () => {
    const { container } = render(<Skeleton className="h-4" />);
    const bloco = container.firstElementChild!;
    expect(bloco).toHaveAttribute("aria-hidden", "true");
    expect(bloco).toHaveClass("animate-pulse", "motion-reduce:animate-none", "h-4");
  });

  it("anuncia o carregamento pelo rótulo, sem ler os blocos", () => {
    render(
      <CarregandoSkeleton rotulo="Carregando clientes">
        <SkeletonTabela linhas={2} colunas={3} />
      </CarregandoSkeleton>,
    );
    const regiao = screen.getByRole("status", { name: "Carregando clientes" });
    expect(regiao).toHaveAttribute("aria-busy", "true");
    expect(regiao).toHaveTextContent("Carregando clientes");
    expect(regiao.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0);
  });
});
