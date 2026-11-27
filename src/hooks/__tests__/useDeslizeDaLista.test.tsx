import { render } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Destaque } from "@/lib/ao-vivo";
import { useDestaquesAoVivo } from "../useAtualizacaoAoVivo";
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

type Item = { id: number; v: number };

/** Como nas telas: a lista vem do hook de dados e os destaques de useDestaquesAoVivo. */
function ListaAoVivo({ itens, aoVivo }: { itens: Item[]; aoVivo: boolean }) {
  const ref = useRef<HTMLUListElement>(null);
  const { destaques, lembrar } = useDestaquesAoVivo(itens, (i) => i.id, (i) => i.v);
  const lembrou = useRef(false);
  // A atualização ao vivo chama lembrar() antes de recarregar.
  useEffect(() => {
    if (aoVivo && !lembrou.current) { lembrar(); lembrou.current = true; }
  }, [aoVivo, lembrar]);
  useDeslizeDaLista(ref, destaques);
  return (
    <ul ref={ref}>
      {itens.map((i) => <li key={i.id} data-chave-ao-vivo={i.id}>{i.id}</li>)}
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

  it("com useDestaquesAoVivo de verdade: os destaques chegam um render depois e ainda anima", () => {
    const { rerender } = render(<ListaAoVivo itens={[{ id: 1, v: 1 }, { id: 2, v: 1 }]} aoVivo={false} />);
    rerender(<ListaAoVivo itens={[{ id: 1, v: 1 }, { id: 2, v: 1 }]} aoVivo />);
    expect(animate).not.toHaveBeenCalled();
    rerender(<ListaAoVivo itens={[{ id: 3, v: 1 }, { id: 1, v: 1 }, { id: 2, v: 1 }]} aoVivo />);
    expect(animate).toHaveBeenCalledTimes(3);
    const quadros = animate.mock.calls.map(([q]) => q[0].transform);
    expect(quadros).toContain("translate(0px, -40px)");
    expect(quadros.some((t: string) => t.startsWith("translateY(-"))).toBe(true);
  });
});
