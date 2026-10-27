import { describe, expect, it } from "vitest";
import { celularValido, clienteSchema } from "@/lib/validations";

const PJ_BASE = {
  documento: "11.222.333/0001-81",
  tipo_pessoa: "PJ" as const,
  razao_social: "Empresa Teste Ltda",
  email: "",
};

const PF_BASE = {
  documento: "111.444.777-35",
  tipo_pessoa: "PF" as const,
  nome: "Maria Silva",
  email: "",
};

function paths(result: ReturnType<typeof clienteSchema.safeParse>): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("clienteSchema: contato inicial de PJ", () => {
  it("PJ com a flag e sem contato falha nos paths de contato", () => {
    const result = clienteSchema.safeParse({
      ...PJ_BASE,
      exigir_contato_inicial: true,
    });
    expect(result.success).toBe(false);
    expect(paths(result)).toEqual(["contato_nome", "contato_telefone"]);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Informe o nome do contato.");
      expect(result.error.issues[1]?.message).toBe("Informe o celular do contato com DDD.");
    }
  });

  it("PJ com a flag e telefone com menos de 10 dígitos falha em contato_telefone", () => {
    const result = clienteSchema.safeParse({
      ...PJ_BASE,
      exigir_contato_inicial: true,
      contato_nome: "Ana",
      contato_telefone: "(11) 9999-999",
    });
    expect(paths(result)).toEqual(["contato_telefone"]);
  });

  it("PJ com a flag e nome de 1 caractere falha em contato_nome", () => {
    const result = clienteSchema.safeParse({
      ...PJ_BASE,
      exigir_contato_inicial: true,
      contato_nome: "A",
      contato_telefone: "(11) 99999-0000",
    });
    expect(paths(result)).toEqual(["contato_nome"]);
  });

  it("PJ com a flag e e-mail inválido falha em contato_email", () => {
    const result = clienteSchema.safeParse({
      ...PJ_BASE,
      exigir_contato_inicial: true,
      contato_nome: "Ana Souza",
      contato_telefone: "(11) 99999-0000",
      contato_email: "ana@",
    });
    expect(paths(result)).toEqual(["contato_email"]);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("E-mail do contato inválido.");
    }
  });

  it("PJ com a flag e contato válido passa", () => {
    const result = clienteSchema.safeParse({
      ...PJ_BASE,
      exigir_contato_inicial: true,
      contato_nome: "Ana Souza",
      contato_telefone: "(11) 99999-0000",
      contato_email: "ana@empresa.com.br",
    });
    expect(result.success).toBe(true);
  });

  it("PJ com a flag e contato válido sem e-mail passa", () => {
    const result = clienteSchema.safeParse({
      ...PJ_BASE,
      exigir_contato_inicial: true,
      contato_nome: "Ana Souza",
      contato_telefone: "1133334444",
    });
    expect(result.success).toBe(true);
  });

  it("PJ sem a flag continua passando sem contato", () => {
    const result = clienteSchema.safeParse(PJ_BASE);
    expect(result.success).toBe(true);
  });

  it("PJ com a flag desligada ignora contato inválido", () => {
    const result = clienteSchema.safeParse({
      ...PJ_BASE,
      exigir_contato_inicial: false,
      contato_email: "invalido",
    });
    expect(result.success).toBe(true);
  });

  it("PF sem a flag continua passando como antes", () => {
    const result = clienteSchema.safeParse(PF_BASE);
    expect(result.success).toBe(true);
  });

  it("PF com a flag não exige contato", () => {
    const result = clienteSchema.safeParse({
      ...PF_BASE,
      exigir_contato_inicial: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("celularValido", () => {
  it("aceita 10 dígitos (fixo com DDD)", () => {
    expect(celularValido("(11) 3333-4444")).toBe(true);
  });

  it("aceita 11 dígitos (celular com DDD)", () => {
    expect(celularValido("(11) 99999-0000")).toBe(true);
  });

  it("rejeita menos de 10 dígitos", () => {
    expect(celularValido("99999-000")).toBe(false);
  });

  it("rejeita mais de 11 dígitos", () => {
    expect(celularValido("119999900001")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(celularValido("")).toBe(false);
  });
});
