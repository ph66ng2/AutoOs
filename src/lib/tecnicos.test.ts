import { describe, expect, it } from "vitest";
import { definirTecnicosDaEmpresa, emailDoTecnico, erroTecnicoDaEntrada, linhaTecnicoInicial, tecnicoPadrao, tecnicosAtivos } from "./tecnicos";
import type { SecurityProfile } from "@/types";

const perfil = (id: number, nome: string, email: string) =>
  ({ id, nome, role: "TECNICO", permissions: [], pin_configured: true, pin_required: true, is_default: false, ativo: true, email_profissional: email, atende_tecnico: true }) as SecurityProfile;

describe("emailDoTecnico", () => {
  it("prefere o nome igual quando dois perfis só diferem no acento", () => {
    definirTecnicosDaEmpresa([perfil(1, "Jose", "jose@empresa.test"), perfil(2, "José", "jose2@empresa.test")]);
    expect(emailDoTecnico("José")).toBe("jose2@empresa.test");
    expect(emailDoTecnico("jose")).toBe("jose@empresa.test");
    expect(emailDoTecnico("JOSÉ ")).toBe("jose2@empresa.test");
  });
  it("sem acento só casa quando há um único perfil parecido", () => {
    definirTecnicosDaEmpresa([perfil(1, "Isaías", "isaias@empresa.test")]);
    expect(emailDoTecnico("Isaias")).toBe("isaias@empresa.test");
    definirTecnicosDaEmpresa([perfil(1, "Josè", "a@empresa.test"), perfil(2, "Josê", "b@empresa.test")]);
    expect(emailDoTecnico("Jose")).toBe("");
  });

  it("homônimo exato entre os técnicos da empresa é ambíguo: sem cópia", () => {
    definirTecnicosDaEmpresa([perfil(1, "Ivan", "ivan1@empresa.test"), perfil(2, "Ivan", "ivan2@empresa.test")]);
    expect(emailDoTecnico("Ivan")).toBe("");
  });

  it("perfil desativado ou que não atende não recebe cópia", () => {
    definirTecnicosDaEmpresa([
      { ...perfil(1, "Ivan", "ivan@empresa.test"), ativo: false },
      { ...perfil(2, "Isaias", "isaias@empresa.test"), atende_tecnico: false },
    ]);
    expect(emailDoTecnico("Ivan")).toBe("");
    expect(emailDoTecnico("Isaias")).toBe("");
    expect(tecnicosAtivos()).toEqual([]);
  });

  it("lista vazia ou inválida (comando falhou) não deixa e-mail velho para trás", () => {
    definirTecnicosDaEmpresa([perfil(1, "Ivan", "ivan@empresa.test")]);
    definirTecnicosDaEmpresa(undefined);
    expect(emailDoTecnico("Ivan")).toBe("");
  });
});

describe("Nova entrada sem nenhum técnico marcado (upgrade da 0051 sem papel TECNICO)", () => {
  it("empresa com zero técnicos não trava a entrada e não inventa e-mail", () => {
    // Quem atende usa perfil ADMIN/ATENDENTE, sem "faz atendimento técnico": o backend devolve lista vazia.
    definirTecnicosDaEmpresa([]);
    expect(tecnicosAtivos()).toEqual([]);
    expect(erroTecnicoDaEntrada("", tecnicosAtivos())).toBeNull();
    expect(linhaTecnicoInicial("", emailDoTecnico(""))).toBe("");
  });

  it("com técnicos marcados, a escolha continua obrigatória", () => {
    definirTecnicosDaEmpresa([perfil(1, "Ivan", "ivan@empresa.test")]);
    expect(erroTecnicoDaEntrada("", tecnicosAtivos())).toMatch(/Escolha o técnico/);
    expect(erroTecnicoDaEntrada("Ivan", tecnicosAtivos())).toBeNull();
    expect(linhaTecnicoInicial("Ivan", emailDoTecnico("Ivan"))).toBe("Técnico inicial: Ivan (ivan@empresa.test)");
  });
});

describe("tecnicoPadrao (técnico já escolhido ao abrir a entrada)", () => {
  it("Admin que não atende, com vários técnicos (inclusive quem só orça e veio marcado pela 0051): nenhum padrão", () => {
    definirTecnicosDaEmpresa([perfil(14, "QA Orçamentista (PREPARE_QUOTES)", "orc@empresa.test"), perfil(2, "QA Técnico", "tec@empresa.test")]);
    expect(tecnicoPadrao(tecnicosAtivos(), 1)).toBe("");
    expect(tecnicoPadrao(tecnicosAtivos(), null)).toBe("");
  });
  it("o próprio perfil da sessão, quando ele atende", () => {
    definirTecnicosDaEmpresa([perfil(14, "QA Orçamentista (PREPARE_QUOTES)", "orc@empresa.test"), perfil(2, "QA Técnico", "tec@empresa.test")]);
    expect(tecnicoPadrao(tecnicosAtivos(), 2)).toBe("QA Técnico");
  });
  it("único técnico da empresa", () => {
    definirTecnicosDaEmpresa([perfil(2, "QA Técnico", "tec@empresa.test")]);
    expect(tecnicoPadrao(tecnicosAtivos(), 1)).toBe("QA Técnico");
    definirTecnicosDaEmpresa([]);
    expect(tecnicoPadrao(tecnicosAtivos(), 1)).toBe("");
  });
});
