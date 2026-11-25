import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { distribuirMudancas } from "@/lib/ao-vivo";
import { podeEntregar } from "@/lib/retirada-balcao";
import type { Equipamento, OrcamentoInsumos } from "@/types";
import { useBuscaRetirada } from "./useBuscaRetirada";

const db = vi.hoisted(() => ({
  listarEquipamentos: vi.fn(),
  listarOrcamentosInsumos: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn().mockResolvedValue(() => undefined) }));

const eq = (id: number, status: string) =>
  ({ id, status, cliente_nome: "Farmácia", marca: "Zebra", modelo: "ZT230", serial_number: `S${id}` }) as unknown as Equipamento;
const venda = (id: number, status: string) =>
  ({ id, status, cliente_nome: "Farmácia", itens: [] }) as unknown as OrcamentoInsumos;

function vendasPorStatus(vendas: OrcamentoInsumos[]) {
  return (filtros: { status?: string }) =>
    Promise.resolve({ items: vendas.filter((v) => v.status === filtros.status), total: vendas.filter((v) => v.status === filtros.status).length });
}

const mudanca = () =>
  act(() => distribuirMudancas([{ tabela: "orcamentos_insumos", id: 1, referencia: null, operacao: "U" }]));

beforeEach(() => {
  db.listarEquipamentos.mockReset();
  db.listarOrcamentosInsumos.mockReset();
});

it("relê a mesma busca em segundo plano numa mudança ao vivo, sem carregar, e segue a entrega", async () => {
  db.listarEquipamentos.mockResolvedValue([eq(1, "EM_MANUTENCAO")]);
  db.listarOrcamentosInsumos.mockImplementation(vendasPorStatus([venda(7, "ENVIADO")]));
  const { result } = renderHook(() => useBuscaRetirada(" Farm "));
  await waitFor(() => expect(result.current.data).toHaveLength(2));
  expect(result.current.data.some(podeEntregar)).toBe(false);
  expect(db.listarEquipamentos).toHaveBeenCalledWith("Farm", undefined, false);

  db.listarEquipamentos.mockResolvedValue([eq(1, "PRONTO")]);
  db.listarOrcamentosInsumos.mockImplementation(vendasPorStatus([venda(7, "APROVADO")]));
  mudanca();
  expect(result.current.loading).toBe(false);
  await waitFor(() => expect(result.current.data.every(podeEntregar)).toBe(true));
  expect(result.current.loading).toBe(false);
  expect(db.listarEquipamentos).toHaveBeenLastCalledWith("Farm", undefined, true);
  expect(db.listarOrcamentosInsumos).toHaveBeenLastCalledWith(expect.objectContaining({ busca: "Farm", page: 0 }), true);

  // Venda entregue sai da busca; equipamento entregue deixa de oferecer a entrega.
  db.listarEquipamentos.mockResolvedValue([eq(1, "ENTREGUE")]);
  db.listarOrcamentosInsumos.mockImplementation(vendasPorStatus([]));
  mudanca();
  await waitFor(() => expect(result.current.data).toHaveLength(1));
  expect(podeEntregar(result.current.data[0])).toBe(false);
});

it("mantém o resultado quando a releitura silenciosa falha", async () => {
  db.listarEquipamentos.mockResolvedValue([eq(1, "PRONTO")]);
  db.listarOrcamentosInsumos.mockImplementation(vendasPorStatus([venda(7, "APROVADO")]));
  const { result } = renderHook(() => useBuscaRetirada("Farm"));
  await waitFor(() => expect(result.current.data).toHaveLength(2));

  db.listarEquipamentos.mockRejectedValue(new Error("caiu"));
  db.listarOrcamentosInsumos.mockRejectedValue(new Error("caiu"));
  mudanca();
  await waitFor(() => expect(db.listarEquipamentos).toHaveBeenLastCalledWith("Farm", undefined, true));
  await act(async () => {
    await Promise.resolve();
  });
  expect(result.current.data).toHaveLength(2);
  expect(result.current.loading).toBe(false);
});

it("descarta a resposta antiga quando uma leitura mais nova já chegou", async () => {
  db.listarEquipamentos.mockResolvedValue([eq(1, "EM_MANUTENCAO")]);
  db.listarOrcamentosInsumos.mockImplementation(vendasPorStatus([]));
  const { result } = renderHook(() => useBuscaRetirada("Farm"));
  await waitFor(() => expect(result.current.data).toHaveLength(1));

  let responderAntiga!: (items: Equipamento[]) => void;
  db.listarEquipamentos.mockImplementationOnce(() => new Promise((resolve) => {
    responderAntiga = resolve;
  }));
  mudanca();
  db.listarEquipamentos.mockResolvedValue([eq(1, "PRONTO")]);
  mudanca();
  await waitFor(() => expect(result.current.data[0] && podeEntregar(result.current.data[0])).toBe(true));

  await act(async () => responderAntiga([eq(1, "EM_MANUTENCAO"), eq(2, "RECEBIDO")]));
  expect(result.current.data).toHaveLength(1);
  expect(podeEntregar(result.current.data[0])).toBe(true);
});

it("não relê com busca menor que 2 caracteres", async () => {
  const { result } = renderHook(() => useBuscaRetirada("F"));
  mudanca();
  await act(async () => {
    await Promise.resolve();
  });
  expect(db.listarEquipamentos).not.toHaveBeenCalled();
  expect(db.listarOrcamentosInsumos).not.toHaveBeenCalled();
  expect(result.current.buscando).toBe(false);
});

it("mudança durante a busca visível vira uma releitura silenciosa depois dela", async () => {
  let responder!: (items: Equipamento[]) => void;
  db.listarEquipamentos.mockImplementationOnce(() => new Promise((resolve) => {
    responder = resolve;
  }));
  db.listarOrcamentosInsumos.mockImplementation(vendasPorStatus([]));
  const { result } = renderHook(() => useBuscaRetirada("Farm"));
  await waitFor(() => expect(result.current.loading).toBe(true));
  mudanca();
  mudanca();
  expect(db.listarEquipamentos).toHaveBeenCalledTimes(1);

  db.listarEquipamentos.mockResolvedValue([eq(1, "PRONTO")]);
  await act(async () => responder([eq(1, "EM_MANUTENCAO")]));
  await waitFor(() => expect(result.current.data[0] && podeEntregar(result.current.data[0])).toBe(true));
  expect(db.listarEquipamentos).toHaveBeenCalledTimes(2);
  expect(db.listarEquipamentos).toHaveBeenLastCalledWith("Farm", undefined, true);
});

it("relê a busca quando um contato muda em outro computador (a busca também filtra por contato)", async () => {
  db.listarEquipamentos.mockResolvedValue([]);
  db.listarOrcamentosInsumos.mockImplementation(vendasPorStatus([]));
  const { result } = renderHook(() => useBuscaRetirada("Maria"));
  await waitFor(() => expect(db.listarEquipamentos).toHaveBeenCalledTimes(1));
  expect(result.current.data).toHaveLength(0);

  db.listarEquipamentos.mockResolvedValue([eq(3, "PRONTO")]);
  act(() => distribuirMudancas([{ tabela: "cliente_contatos", id: 9, referencia: 4, operacao: "U" }]));
  await waitFor(() => expect(result.current.data).toHaveLength(1));
  expect(db.listarEquipamentos).toHaveBeenLastCalledWith("Maria", undefined, true);
});
