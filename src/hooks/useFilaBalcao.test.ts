import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { distribuirMudancas } from "@/lib/ao-vivo";
import { useFilaBalcao } from "./useFilaBalcao";

const db = vi.hoisted(() => ({
  listarEquipamentosPaginados: vi.fn(),
  listarOrcamentosInsumos: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));

it("atualiza a fila em segundo plano e ignora uma resposta ao vivo atrasada", async () => {
  db.listarEquipamentosPaginados.mockResolvedValue({ items: [], total: 1 });
  db.listarOrcamentosInsumos.mockResolvedValue({ items: [], total: 0 });
  const { result } = renderHook(useFilaBalcao);
  await waitFor(() => expect(result.current.totalProntos).toBe(1));

  let responderAntiga!: (pagina: { items: []; total: number }) => void;
  db.listarEquipamentosPaginados.mockImplementationOnce(() => new Promise((resolve) => {
    responderAntiga = resolve;
  }));
  act(() => distribuirMudancas([{ tabela: "equipamentos", id: 1, referencia: null, operacao: "U" }]));
  expect(result.current.loading).toBe(false);

  db.listarEquipamentosPaginados.mockResolvedValue({ items: [], total: 3 });
  act(() => distribuirMudancas([{ tabela: "orcamentos_insumos", id: 2, referencia: null, operacao: "U" }]));
  await waitFor(() => expect(result.current.totalProntos).toBe(3));
  expect(db.listarEquipamentosPaginados).toHaveBeenNthCalledWith(3, undefined, "PRONTO", 0, "ATUALIZACAO_RECENTE", undefined, true);
  expect(db.listarEquipamentosPaginados).toHaveBeenLastCalledWith(undefined, undefined, 0, "CADASTRO_RECENTE", undefined, true);
  expect(db.listarOrcamentosInsumos).toHaveBeenLastCalledWith({ status: "APROVADO", page: 0 }, true);

  await act(async () => responderAntiga({ items: [], total: 2 }));
  expect(result.current.totalProntos).toBe(3);
});
