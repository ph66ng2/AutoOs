import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Destaque } from "@/lib/ao-vivo";
import { useDeslizeDaLista } from "../useDeslizeDaLista";

const animate = vi.fn();

function Lista({ ids, destaques }: { ids: number[]; destaques: Map<number | string, Destaque> }) {
  const ref = useRef<HTMLUListElement>(null);
  useDeslizeDaLista(ref, destaques);
  return (
    <ul ref={ref}>
      {ids.map((id) => <li key={id} data-chave-ao-vivo={id}>{id}</li>)}
    </ul>
  );
}

describe("useDeslizeDaLista", () => {
  beforeEach(() => {
    animate.mockReset();
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    // offsetTop pela ordem do item na lista (jsdom não faz layout).
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
      return Array.prototype.indexOf.call(this.parentElement?.children ?? [], this) * 40;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  it("item novo: a lista desce deslizando e o novo entra do alto", () => {
    const { rerender } = render(<Lista ids={[1, 2]} destaques={new Map()} />);
    expect(animate).not.toHaveBeenCalled();
    rerender(<Lista ids={[3, 1, 2]} destaques={new Map([[3, "novo"]])} />);
    expect(animate).toHaveBeenCalledTimes(3);
    const quadros = animate.mock.calls.map(([q]) => q[0].transform);
    expect(quadros).toContain("translate(0px, -40px)");
    expect(quadros.some((t: string) => t.startsWith("translateY(-"))).toBe(true);
  });

  it("troca de página ou item só alterado não anima", () => {
    const { rerender } = render(<Lista ids={[1, 2]} destaques={new Map()} />);
    rerender(<Lista ids={[4, 5]} destaques={new Map()} />);
    rerender(<Lista ids={[4, 5]} destaques={new Map([[4, "alterado"]])} />);
    expect(animate).not.toHaveBeenCalled();
  });
});
