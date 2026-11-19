import { describe, expect, it } from "vitest";
import { categoriasDoMes, dinheiro, dinheiroComSinal, maiorCategoria, mediaVariavelAnterior, porcentagem, totaisDoMes, variacao } from "./financas";
import type { GastoFixo, GastoVariavel } from "@/types";

const fixos: GastoFixo[] = [
  { id: 1, nome: "Folha", valor: 4800, categoria: "Folha", ativo: true },
  { id: 2, nome: "Aluguel", valor: 3200, categoria: "Aluguel", ativo: true },
  { id: 3, nome: "Antigo", valor: 999, categoria: "Outros", ativo: false },
];
const variaveis: GastoVariavel[] = [
  { id: 4, descricao: "Etiquetas", valor: 1970, data: "2026-11-09", categoria: "Fornecedores" },
  { id: 5, descricao: "Rolete", valor: 420, data: "2026-11-04", categoria: "Fornecedores" },
  { id: 6, descricao: "Bônus", valor: 300, data: "2026-11-04", categoria: "Folha" },
];

describe("financas", () => {
  it("totais ignoram fixo inativo e somam a lista de variáveis", () => {
    expect(totaisDoMes(fixos, variaveis)).toMatchObject({ fixo: 8000, variavel: 2690, total: 10690, quantidadeFixos: 2, quantidadeVariaveis: 3 });
  });

  it("categorias separam fixo e variável; maior categoria soma os dois", () => {
    expect(categoriasDoMes(fixos, variaveis)).toEqual([
      { categoria: "Folha", tipo: "fixo", valor: 4800 },
      { categoria: "Aluguel", tipo: "fixo", valor: 3200 },
      { categoria: "Fornecedores", tipo: "variavel", valor: 2390 },
      { categoria: "Folha", tipo: "variavel", valor: 300 },
    ]);
    const maior = maiorCategoria(categoriasDoMes(fixos, variaveis))!;
    expect(maior.categoria).toBe("Folha");
    expect(maior.valor).toBe(5100);
    expect(maior.parte).toBeCloseTo(5100 / 10690);
  });

  it("média dos variáveis dos 12 meses anteriores, sem contar meses futuros", () => {
    const meses = [
      { mes: 10, ano: 2026, variavel: 1000, futuro: false },
      { mes: 9, ano: 2026, variavel: 3000, futuro: false },
      { mes: 10, ano: 2025, variavel: 9999, futuro: false },
      { mes: 12, ano: 2026, variavel: 0, futuro: true },
    ];
    expect(mediaVariavelAnterior(meses, 11, 2026)).toBe(2000);
    expect(mediaVariavelAnterior([], 11, 2026)).toBeNull();
  });

  it("variação, porcentagem e dinheiro (inclusive oculto)", () => {
    expect(variacao(105, 100)).toBeCloseTo(0.05);
    expect(variacao(10, 0)).toBeNull();
    expect(porcentagem(0.065, 1)).toBe("+6,5%");
    expect(porcentagem(-0.03)).toBe("−3%");
    expect(dinheiro(4600)).toMatch(/R\$\s*4\.600,00/);
    expect(dinheiro(4600, true)).toBe("R$ •••••");
    expect(dinheiroComSinal(-300)).toMatch(/^−R\$\s*300,00$/);
  });
});
