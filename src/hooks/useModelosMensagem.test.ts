import { renderHook, waitFor, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listarModelosMensagem: vi.fn().mockResolvedValue([]),
  aoVivo: null as null | (() => void),
}));

vi.mock("@/lib/db", () => ({ db: { listarModelosMensagem: mocks.listarModelosMensagem } }));
vi.mock("@/hooks/useAtualizacaoAoVivo", () => ({
  useAtualizacaoAoVivo: (_tabelas: string[], cb: () => void) => { mocks.aoVivo = cb; },
}));

import { useModelosMensagem } from "./useModelosMensagem";

describe("useModelosMensagem", () => {
  it("recarga ao vivo pede a lista em segundo plano (não renova a sessão)", async () => {
    renderHook(() => useModelosMensagem());
    await waitFor(() => expect(mocks.listarModelosMensagem).toHaveBeenCalledWith(false));
    await act(async () => { mocks.aoVivo?.(); });
    await waitFor(() => expect(mocks.listarModelosMensagem).toHaveBeenLastCalledWith(true));
  });
});
