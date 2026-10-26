import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PublicStatusPage, { latestAcceptedPublicStatus } from "./PublicStatusPage";
import { buscarStatusPublico } from "./api";

vi.mock("./api", () => ({
  buscarStatusPublico: vi.fn(),
  PublicStatusRequestError: class PublicStatusRequestError extends Error {
    constructor(public readonly kind: "rate-limit" | "service" | "unavailable") {
      super(kind);
    }
  },
}));

const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);

function response(titulo: string) {
  return {
    equipamento: "Zebra ZT230",
    titulo,
    orientacao: "Aguarde o próximo contato da equipe.",
    statusAlteradoEm: "2026-10-01T12:00:00.000Z",
  };
}

beforeEach(() => {
  vi.mocked(buscarStatusPublico).mockReset();
  latestAcceptedPublicStatus.title = null;
  window.location.hash = `#/c/${tokenA}`;
});

describe("PublicStatusPage", () => {
  it("consulta de novo quando o hash muda na mesma aba", async () => {
    vi.mocked(buscarStatusPublico).mockImplementation(async (token: string) =>
      response(token === tokenA ? "Estamos analisando seu equipamento" : "Equipamento entregue"),
    );

    render(<PublicStatusPage />);

    expect(await screen.findByRole("heading", { name: "Estamos analisando seu equipamento" })).toBeInTheDocument();
    expect(buscarStatusPublico).toHaveBeenCalledWith(tokenA);

    await act(async () => {
      window.location.hash = `#/c/${tokenB}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(await screen.findByRole("heading", { name: "Equipamento entregue" })).toBeInTheDocument();
    await waitFor(() => expect(buscarStatusPublico).toHaveBeenCalledWith(tokenB));
  });

  it("não renderiza a resposta antiga que chega depois da troca do hash", async () => {
    let resolveA: (value: ReturnType<typeof response>) => void = () => {};
    let resolveB: (value: ReturnType<typeof response>) => void = () => {};
    vi.mocked(buscarStatusPublico).mockImplementation((token: string) => {
      if (token === tokenA) {
        return new Promise((resolve) => {
          resolveA = resolve;
        });
      }
      return new Promise((resolve) => {
        resolveB = resolve;
      });
    });

    const staleTitle = "Estamos analisando seu equipamento";
    latestAcceptedPublicStatus.title = null;
    render(<PublicStatusPage />);
    expect(screen.getByText("Consultando o atendimento…")).toBeInTheDocument();

    await act(async () => {
      window.location.hash = `#/c/${tokenB}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      resolveA(response(staleTitle));
      await Promise.resolve();
    });

    expect(latestAcceptedPublicStatus.title).not.toBe(staleTitle);
    expect(screen.queryByRole("heading", { name: staleTitle })).not.toBeInTheDocument();
    expect(screen.getByText("Consultando o atendimento…")).toBeInTheDocument();

    await act(async () => {
      resolveB(response("Equipamento entregue"));
    });

    expect(await screen.findByRole("heading", { name: "Equipamento entregue" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: staleTitle })).not.toBeInTheDocument();
    expect(latestAcceptedPublicStatus.title).toBe("Equipamento entregue");
  });

  it("remove o listener de hashchange ao desmontar", async () => {
    vi.mocked(buscarStatusPublico).mockResolvedValue(response("Estamos analisando seu equipamento"));
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const view = render(<PublicStatusPage />);
    await screen.findByRole("heading", { name: "Estamos analisando seu equipamento" });

    const hashListener = addSpy.mock.calls.find((call) => call[0] === "hashchange")?.[1];
    expect(hashListener).toEqual(expect.any(Function));

    view.unmount();

    expect(removeSpy.mock.calls.some((call) => call[0] === "hashchange" && call[1] === hashListener)).toBe(true);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
