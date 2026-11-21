import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listarMensagensChamado: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { listarMensagensChamado: mocks.listarMensagensChamado } }));
vi.mock("@/hooks/useAtualizacaoAoVivo", () => ({ useAtualizacaoAoVivo: () => undefined }));

import { useMensagensChamado } from "./useSuporte";

const msg = (id: number, texto: string) => ({ id, autor: "suporte", autor_nome: "Erykah", texto, automatica: true, criado_em: "2026-11-21 10:00:00+00" });

describe("useMensagensChamado", () => {
  it("trocar de chamado volta a carregar; recarga do mesmo chamado é em segundo plano", async () => {
    let soltar: (lista: unknown[]) => void = () => undefined;
    mocks.listarMensagensChamado.mockImplementation(async (id: number) => (id === 1 ? [msg(1, "do chamado 1")] : new Promise((r) => { soltar = r; })));
    const { result, rerender } = renderHook(({ id, versao }) => useMensagensChamado(id, true, versao), { initialProps: { id: 1, versao: "a" } });
    await waitFor(() => expect(result.current?.[0]?.texto).toBe("do chamado 1"));
    expect(mocks.listarMensagensChamado).toHaveBeenLastCalledWith(1, false);

    rerender({ id: 1, versao: "b" });
    await waitFor(() => expect(mocks.listarMensagensChamado).toHaveBeenLastCalledWith(1, true));

    rerender({ id: 2, versao: "b" });
    expect(result.current).toBeNull();
    expect(mocks.listarMensagensChamado).toHaveBeenLastCalledWith(2, false);
    soltar([msg(2, "do chamado 2")]);
    await waitFor(() => expect(result.current?.[0]?.texto).toBe("do chamado 2"));
  });
});
