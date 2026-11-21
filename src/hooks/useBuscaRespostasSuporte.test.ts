import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sincronizar: vi.fn(), toast: Object.assign(vi.fn(), { info: vi.fn() }) }));
vi.mock("@/lib/db", () => ({ db: { sincronizarSuporte: mocks.sincronizar } }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/notificacao-sistema", () => ({ notificarSistema: vi.fn() }));
import { avisosDeResposta, useBuscaRespostasSuporte } from "./useBuscaRespostasSuporte";
import { intervaloDeBusca, marcarEnvioAoSuporte } from "@/lib/suporte-ponte";

describe("respostas do suporte", () => {
  it("um aviso por chamado, com a última resposta, sem marcação do Slack e curto", () => {
    const longa = "x".repeat(200);
    const avisos = avisosDeResposta([
      { chamado_id: 12, autor_nome: null, texto: "Primeira", automatica: true },
      { chamado_id: 12, autor_nome: null, texto: "_Não envie_ o *orçamento*\nainda", automatica: true },
      { chamado_id: 9, autor_nome: "Paulo", texto: longa, automatica: false },
    ]);
    expect(avisos).toEqual([
      { chamadoId: 12, titulo: "Suporte respondeu o chamado #12", texto: "Não envie o orçamento ainda" },
      { chamadoId: 9, titulo: "Suporte respondeu o chamado #9", texto: `${"x".repeat(139)}…` },
    ]);
  });

  it("busca a cada 10 s nos 3 minutos depois de um envio, depois a cada 60 s", () => {
    marcarEnvioAoSuporte(1_000_000);
    expect(intervaloDeBusca(1_000_000 + 60_000)).toBe(10_000);
    expect(intervaloDeBusca(1_000_000 + 3 * 60_000 + 1)).toBe(60_000);
  });

  it("resposta que chega depois de trocar de perfil é descartada (não vira aviso do perfil novo)", async () => {
    vi.useFakeTimers();
    let soltar: (v: unknown) => void = () => undefined;
    mocks.sincronizar.mockReturnValueOnce(new Promise((r) => { soltar = r; })).mockResolvedValue([]);
    const wrapper = ({ children }: { children: ReactNode }) => createElement(MemoryRouter, null, children);
    const { rerender } = renderHook(({ perfil }) => useBuscaRespostasSuporte(true, perfil), { wrapper, initialProps: { perfil: 1 } });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(mocks.sincronizar).toHaveBeenCalledTimes(1);
    rerender({ perfil: 2 });
    await act(async () => { soltar([{ chamado_id: 7, autor_nome: null, texto: "Do perfil 1", automatica: true }]); });
    expect(mocks.toast.info).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
