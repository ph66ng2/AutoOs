import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listarMensagensChamado: vi.fn(),
  listarChamadosSuporte: vi.fn(),
  obterConfigSuporte: vi.fn(),
  aoVivo: null as null | (() => void),
  unlocked: true,
}));
vi.mock("@/lib/db", () => ({
  db: { listarMensagensChamado: mocks.listarMensagensChamado, listarChamadosSuporte: mocks.listarChamadosSuporte, obterConfigSuporte: mocks.obterConfigSuporte },
}));
vi.mock("@/hooks/useAtualizacaoAoVivo", () => ({
  useAtualizacaoAoVivo: (_tabelas: string[], recarregar: () => void) => { mocks.aoVivo = recarregar; },
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ status: { unlocked: mocks.unlocked } }) }));

import { useMensagensChamado, useSuporte } from "./useSuporte";

describe("useSuporte", () => {
  it("abrir a página lê renovando a sessão; recarga ao vivo é de segundo plano e não roda bloqueada", async () => {
    mocks.unlocked = true;
    mocks.obterConfigSuporte.mockResolvedValue({ token_neste_computador: true, canal: "C0CE5M6GTRV" });
    mocks.listarChamadosSuporte.mockResolvedValue([]);
    const { result, rerender } = renderHook(() => useSuporte());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mocks.listarChamadosSuporte).toHaveBeenLastCalledWith(false);

    mocks.aoVivo?.();
    await waitFor(() => expect(mocks.listarChamadosSuporte).toHaveBeenCalledTimes(2));
    expect(mocks.listarChamadosSuporte).toHaveBeenLastCalledWith(true);

    mocks.unlocked = false;
    rerender();
    mocks.aoVivo?.();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.listarChamadosSuporte).toHaveBeenCalledTimes(2);
  });
});

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
