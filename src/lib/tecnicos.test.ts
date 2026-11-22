import { describe, expect, it } from "vitest";
import { definirTecnicosDaEmpresa, emailDoTecnico, tecnicosAtivos } from "./tecnicos";
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
