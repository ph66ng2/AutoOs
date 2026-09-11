import { describe, expect, it } from "vitest";
import type { Equipamento } from "@/types";
import { resolveRecipient } from "@/lib/recipient-resolver";

const equipamento: Equipamento = {
  id: 1,
  empresa_id: 7,
  cliente_id: 11,
  serial_number: "SN-1",
  marca: "Zebra",
  modelo: "ZT230",
  tipo: "Impressora",
  status: "AGUARDANDO_APROVACAO",
  data_entrada: "2026-09-11",
  cliente_nome: "Empresa Geral",
  cliente_email: "geral@empresa.test",
  cliente_telefone: "71999990000",
  responsavel_contato_id: 22,
  responsavel_nome: "Ana Responsável",
  responsavel_email: "ana@empresa.test",
  responsavel_telefone: "71988880000",
};

describe("resolveRecipient", () => {
  it("prioriza o responsável por e-mail e telefone independentemente", () => {
    expect(resolveRecipient(equipamento, "email")).toEqual({
      nome: "Ana Responsável",
      endereco: "ana@empresa.test",
      origem: "responsavel",
    });
    expect(resolveRecipient(equipamento, "telefone")).toEqual({
      nome: "Ana Responsável",
      endereco: "71988880000",
      origem: "responsavel",
    });
  });

  it("usa o cadastro geral quando o responsável não possui aquele canal", () => {
    const semEmail = { ...equipamento, responsavel_email: undefined };
    const semTelefone = { ...equipamento, responsavel_telefone: undefined };
    expect(resolveRecipient(semEmail, "email").origem).toBe("cadastro_empresa");
    expect(resolveRecipient(semEmail, "email").endereco).toBe("geral@empresa.test");
    expect(resolveRecipient(semTelefone, "telefone").origem).toBe("cadastro_empresa");
    expect(resolveRecipient(semTelefone, "telefone").endereco).toBe("71999990000");
  });

  it("usa entrada manual apenas quando não há endereço geral", () => {
    const semCadastro = {
      ...equipamento,
      responsavel_email: undefined,
      cliente_email: undefined,
      cliente_telefone: undefined,
    };
    expect(resolveRecipient(semCadastro, "email", "manual@empresa.test")).toEqual({
      nome: "Ana Responsável",
      endereco: "manual@empresa.test",
      origem: "manual",
    });
  });

  it("retorna sem envio quando nenhum endereço existe", () => {
    const semEndereco = { ...equipamento, responsavel_email: undefined, cliente_email: undefined };
    expect(resolveRecipient(semEndereco, "email")).toEqual({
      nome: "Ana Responsável",
      endereco: "",
      origem: "sem_envio",
    });
  });
});
