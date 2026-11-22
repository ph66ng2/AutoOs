import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const resumoEstoque = vi.hoisted(() => vi.fn());
const sessao = vi.hoisted(() => ({ status: null as unknown }));

vi.mock("@/lib/db", () => ({ db: { resumoEstoque } }));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ status: sessao.status }) }));

import { useResumoEstoque } from "@/hooks/useResumoEstoque";

const base = { totalItens: 3, porCategoria: [], abaixoMinimo: 0, aguardandoPeca: 0, saidasMes: 0, saidasMesOs: 0 };

describe("useResumoEstoque", () => {
  beforeEach(() => {
    resumoEstoque.mockReset();
  });

  it("descarta o valor em estoque na hora ao trocar para um perfil sem a permissão", async () => {
    sessao.status = { unlocked: true, active_profile_id: 1, permissions: ["VIEW_EXPENSES"] };
    resumoEstoque.mockResolvedValueOnce({ ...base, valorEstoque: 1500 });
    const { result, rerender } = renderHook(() => useResumoEstoque());
    await waitFor(() => expect(result.current.resumo?.valorEstoque).toBe(1500));

    let responder: (valor: unknown) => void = () => undefined;
    resumoEstoque.mockReturnValueOnce(new Promise((resolve) => { responder = resolve; }));
    sessao.status = { unlocked: true, active_profile_id: 2, permissions: [] };
    rerender();
    expect(result.current.resumo).toBeNull();

    responder({ ...base, valorEstoque: null });
    await waitFor(() => expect(result.current.resumo?.totalItens).toBe(3));
    expect(result.current.resumo?.valorEstoque).toBeNull();
  });

  it("ao bloquear a sessão, o resumo do perfil anterior some", async () => {
    sessao.status = { unlocked: true, active_profile_id: 1, permissions: ["VIEW_EXPENSES"] };
    resumoEstoque.mockResolvedValueOnce({ ...base, valorEstoque: 900 });
    const { result, rerender } = renderHook(() => useResumoEstoque());
    await waitFor(() => expect(result.current.resumo?.valorEstoque).toBe(900));

    resumoEstoque.mockRejectedValueOnce(new Error("Sessão bloqueada"));
    sessao.status = { unlocked: false, active_profile_id: 1, permissions: [] };
    rerender();
    expect(result.current.resumo).toBeNull();
    await waitFor(() => expect(resumoEstoque).toHaveBeenCalledTimes(2));
    expect(result.current.resumo).toBeNull();
  });

  it("uma resposta atrasada do perfil anterior não volta a aparecer", async () => {
    let antiga: (valor: unknown) => void = () => undefined;
    sessao.status = { unlocked: true, active_profile_id: 1, permissions: ["VIEW_EXPENSES"] };
    resumoEstoque.mockReturnValueOnce(new Promise((resolve) => { antiga = resolve; }));
    const { result, rerender } = renderHook(() => useResumoEstoque());

    resumoEstoque.mockResolvedValueOnce({ ...base, valorEstoque: null });
    sessao.status = { unlocked: true, active_profile_id: 2, permissions: [] };
    rerender();
    await waitFor(() => expect(result.current.resumo?.totalItens).toBe(3));

    antiga({ ...base, valorEstoque: 7000 });
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.resumo?.valorEstoque).toBeNull();
  });
});
