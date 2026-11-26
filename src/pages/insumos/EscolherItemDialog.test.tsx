import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { EscolherItemDialog } from "./EscolherItemDialog";
import type { Produto } from "@/types";

const mocks = vi.hoisted(() => ({
  recarregar: vi.fn(),
}));

vi.mock("@/hooks/useInsumos", () => ({
  useInsumos: () => ({
    produtos: [] as Produto[],
    loading: false,
    recarregar: mocks.recarregar,
  }),
}));

describe("EscolherItemDialog", () => {
  it("recarrega os itens quando o diálogo abre", () => {
    const { rerender } = render(
      <EscolherItemDialog open={false} onOpenChange={vi.fn()} onEscolher={vi.fn()} />,
    );
    expect(mocks.recarregar).not.toHaveBeenCalled();
    rerender(<EscolherItemDialog open onOpenChange={vi.fn()} onEscolher={vi.fn()} />);
    expect(mocks.recarregar).toHaveBeenCalledTimes(1);
  });
});
