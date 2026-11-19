import { describe, expect, it } from "vitest";
import { definirPerfisConhecidos, emailDoTecnico } from "./tecnicos";
import type { SecurityProfile } from "@/types";

const perfil = (id: number, nome: string, email: string) =>
  ({ id, nome, role: "TECNICO", permissions: [], pin_configured: true, pin_required: true, is_default: false, ativo: true, email_profissional: email, atende_tecnico: true }) as SecurityProfile;

describe("emailDoTecnico", () => {
  it("prefere o nome igual quando dois perfis só diferem no acento", () => {
    definirPerfisConhecidos([perfil(1, "Jose", "jose@empresa.test"), perfil(2, "José", "jose2@empresa.test")]);
    expect(emailDoTecnico("José")).toBe("jose2@empresa.test");
    expect(emailDoTecnico("jose")).toBe("jose@empresa.test");
    expect(emailDoTecnico("JOSÉ ")).toBe("jose2@empresa.test");
  });
  it("sem acento só casa quando há um único perfil parecido", () => {
    definirPerfisConhecidos([perfil(1, "Isaías", "isaias@empresa.test")]);
    expect(emailDoTecnico("Isaias")).toBe("isaias@empresa.test");
    definirPerfisConhecidos([perfil(1, "Josè", "a@empresa.test"), perfil(2, "Josê", "b@empresa.test")]);
    expect(emailDoTecnico("Jose")).toBe("");
  });
});
