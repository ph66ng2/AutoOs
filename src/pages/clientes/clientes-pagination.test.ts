import { describe, expect, it } from "vitest";
import {
  clientesDaAba,
  itensPaginacao,
  totalAbasClientes,
} from "./clientes-pagination";

describe("paginação de clientes", () => {
  const clientes = Array.from({ length: 21 }, (_, indice) => indice + 1);

  it("mantém no máximo dez clientes por aba", () => {
    expect(totalAbasClientes(10)).toBe(1);
    expect(totalAbasClientes(11)).toBe(2);
    expect(totalAbasClientes(21)).toBe(3);
    expect(clientesDaAba(clientes, 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(clientesDaAba(clientes, 2)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(clientesDaAba(clientes, 3)).toEqual([21]);
  });

  it("mantém a aba dentro dos limites quando a lista muda", () => {
    expect(clientesDaAba(clientes.slice(0, 11), 3)).toEqual([11]);
    expect(clientesDaAba(clientes, 0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("mantém todas as páginas visíveis em listas pequenas", () => {
    expect(itensPaginacao(2, 1)).toEqual([1, 2]);
    expect(itensPaginacao(6, 3)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(itensPaginacao(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("limita listas longas e mantém a região da página atual visível", () => {
    expect(itensPaginacao(12, 1)).toEqual([
      1,
      2,
      3,
      4,
      5,
      "reticencias-fim",
      12,
    ]);
    expect(itensPaginacao(12, 6)).toEqual([
      1,
      "reticencias-inicio",
      5,
      6,
      7,
      "reticencias-fim",
      12,
    ]);
    expect(itensPaginacao(12, 12)).toEqual([
      1,
      "reticencias-inicio",
      8,
      9,
      10,
      11,
      12,
    ]);
  });

  it("normaliza página atual e total fora dos limites", () => {
    expect(itensPaginacao(12, 0)).toEqual([
      1,
      2,
      3,
      4,
      5,
      "reticencias-fim",
      12,
    ]);
    expect(itensPaginacao(0, 9)).toEqual([1]);
  });
});
