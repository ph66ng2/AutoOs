import { describe, expect, it } from "vitest";
import { clientesDaAba, totalAbasClientes } from "./clientes-pagination";

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
});
