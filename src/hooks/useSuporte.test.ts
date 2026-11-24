import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listarMensagensChamado: vi.fn(),
  listarChamadosSuporte: vi.fn(),
  obterConfigSuporte: vi.fn(),
  buscarChamadoSuporte: vi.fn(),
  aoVivo: null as null | (() => void),
  unlocked: true,
}));
vi.mock("@/lib/db", () => ({
  db: { listarMensagensChamado: mocks.listarMensagensChamado, listarChamadosSuporte: mocks.listarChamadosSuporte, obterConfigSuporte: mocks.obterConfigSuporte, buscarChamadoSuporte: mocks.buscarChamadoSuporte },
}));
vi.mock("@/hooks/useAtualizacaoAoVivo", () => ({
  useAtualizacaoAoVivo: (_tabelas: string[], recarregar: () => void) => { mocks.aoVivo = recarregar; },
}));
vi.mock("@/hooks/useSensitiveAccess", () => ({ useSensitiveAccess: () => ({ status: { unlocked: mocks.unlocked } }) }));

import { useChamadoForaDaLista, useMensagensChamado, useSuporte } from "./useSuporte";

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
    await waitFor(() => expect(result.current.mensagens?.[0]?.texto).toBe("do chamado 1"));
    expect(mocks.listarMensagensChamado).toHaveBeenLastCalledWith(1, false);

    rerender({ id: 1, versao: "b" });
    await waitFor(() => expect(mocks.listarMensagensChamado).toHaveBeenLastCalledWith(1, true));

    rerender({ id: 2, versao: "b" });
    expect(result.current.mensagens).toBeNull();
    expect(mocks.listarMensagensChamado).toHaveBeenLastCalledWith(2, false);
    soltar([msg(2, "do chamado 2")]);
    await waitFor(() => expect(result.current.mensagens?.[0]?.texto).toBe("do chamado 2"));
  });

  it("releitura que falha mantém a conversa e tenta de novo em segundo plano na próxima mudança ou foco", async () => {
    mocks.listarMensagensChamado.mockReset();
    const conversa = [msg(1, "Recarregue a OS"), { ...msg(2, "Tente agora"), autor: "suporte" }];
    mocks.listarMensagensChamado.mockResolvedValueOnce(conversa);
    const { result, rerender } = renderHook(({ versao }) => useMensagensChamado(7, true, versao), { initialProps: { versao: "a" } });
    await waitFor(() => expect(result.current.mensagens).toEqual(conversa));

    mocks.listarMensagensChamado.mockRejectedValueOnce("Banco indisponível");
    rerender({ versao: "b" });
    await waitFor(() => expect(result.current.falhou).toBe(true));
    // A conversa continua (inclusive a última do suporte, que mantém "Isso resolveu?").
    expect(result.current.mensagens).toEqual(conversa);

    // Foco/reconexão (lista vazia de mudanças) com a mesma versão: relê em segundo plano.
    const nova = [...conversa, msg(3, "Resolvido?")];
    mocks.listarMensagensChamado.mockResolvedValueOnce(nova);
    act(() => mocks.aoVivo?.());
    await waitFor(() => expect(result.current.mensagens).toEqual(nova));
    expect(mocks.listarMensagensChamado).toHaveBeenCalledTimes(3);
    expect(mocks.listarMensagensChamado).toHaveBeenLastCalledWith(7, true);
    expect(result.current.falhou).toBe(false);

    // Sem falha pendente, o foco não relê à toa (a versão já cuida das mudanças).
    act(() => mocks.aoVivo?.());
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.listarMensagensChamado).toHaveBeenCalledTimes(3);
  });

  it("primeira leitura que falha não vira conversa vazia; Tentar de novo relê renovando a sessão", async () => {
    mocks.listarMensagensChamado.mockReset();
    mocks.listarMensagensChamado.mockRejectedValueOnce("Banco indisponível");
    const { result } = renderHook(() => useMensagensChamado(8, true, "a"));
    await waitFor(() => expect(result.current.falhou).toBe(true));
    expect(result.current.mensagens).toBeNull();

    mocks.listarMensagensChamado.mockRejectedValueOnce("ainda fora");
    act(() => mocks.aoVivo?.());
    await waitFor(() => expect(mocks.listarMensagensChamado).toHaveBeenCalledTimes(2));
    // Tentativa automática é de segundo plano: não renova a sessão de quem saiu da máquina.
    expect(mocks.listarMensagensChamado).toHaveBeenLastCalledWith(8, true);
    await waitFor(() => expect(result.current.falhou).toBe(true));

    mocks.listarMensagensChamado.mockResolvedValueOnce([msg(1, "Oi")]);
    act(() => result.current.tentarDeNovo());
    await waitFor(() => expect(result.current.mensagens?.[0]?.texto).toBe("Oi"));
    expect(mocks.listarMensagensChamado).toHaveBeenLastCalledWith(8, false);
    expect(result.current.falhou).toBe(false);
  });
});

describe("useChamadoForaDaLista", () => {
  it("lê o chamado pelo id e não devolve o de outro id", async () => {
    const chamado = { id: 3, texto: "Antigo", situacao: "resolvido", criado_em: "2026-01-01", atualizado_em: "2026-01-02", respostas: 2 };
    mocks.buscarChamadoSuporte.mockResolvedValueOnce(chamado);
    const { result, rerender } = renderHook(({ id }: { id: number | null }) => useChamadoForaDaLista(id), { initialProps: { id: 3 as number | null } });
    await waitFor(() => expect(result.current).toEqual(chamado));
    expect(mocks.buscarChamadoSuporte).toHaveBeenCalledWith(3);
    rerender({ id: null });
    expect(result.current).toBeNull();
  });
});
