import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Cliente, Equipamento } from "@/types";

const mockBuscarCliente = vi.hoisted(() => vi.fn());
const mockAtualizarCliente = vi.hoisted(() => vi.fn());
const mockAtualizarClienteContato = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  db: {
    buscarCliente: mockBuscarCliente,
    atualizarCliente: mockAtualizarCliente,
    atualizarClienteContato: mockAtualizarClienteContato,
  },
}));

import { saveRecipientAddress } from "@/lib/recipient-persistence";

const base: Equipamento = {
  id: 1,
  empresa_id: 7,
  cliente_id: 11,
  serial_number: "SN-1",
  marca: "Zebra",
  modelo: "ZT230",
  tipo: "Impressora",
  status: "RECEBIDO",
  data_entrada: "2026-09-11",
  cliente_nome: "Empresa",
};

const cliente: Cliente = {
  id: 11,
  empresa_id: 7,
  tipo_pessoa: "PJ",
  nome: "Empresa",
  razao_social: "Empresa LTDA",
  telefone: "71999990000",
  email: "",
};

describe("saveRecipientAddress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuscarCliente.mockResolvedValue(cliente);
    mockAtualizarCliente.mockResolvedValue(undefined);
    mockAtualizarClienteContato.mockResolvedValue(undefined);
  });

  it("salva e-mail manual no contato responsável quando há vínculo", async () => {
    await saveRecipientAddress({
      ...base,
      responsavel_contato_id: 22,
      responsavel_nome: "Ana",
      responsavel_telefone: "71988880000",
    }, "email", "ana.novo@empresa.test");

    expect(mockAtualizarClienteContato).toHaveBeenCalledWith(22, expect.objectContaining({
      empresa_id: 7,
      cliente_id: 11,
      nome: "Ana",
      email: "ana.novo@empresa.test",
      telefone: "71988880000",
    }));
    expect(mockAtualizarCliente).not.toHaveBeenCalled();
  });

  it("salva e-mail manual no cadastro geral sem responsável", async () => {
    await saveRecipientAddress(base, "email", "geral.novo@empresa.test");

    expect(mockAtualizarCliente).toHaveBeenCalledWith(11, expect.objectContaining({
      email: "geral.novo@empresa.test",
      telefone: "71999990000",
    }));
    expect(mockAtualizarClienteContato).not.toHaveBeenCalled();
  });

  it("mantém a independência do canal ao salvar telefone no contato responsável", async () => {
    await saveRecipientAddress({
      ...base,
      responsavel_contato_id: 22,
      responsavel_nome: "Ana",
      responsavel_email: "ana@empresa.test",
    }, "telefone", "71987776666");

    expect(mockAtualizarClienteContato).toHaveBeenCalledWith(22, expect.objectContaining({
      email: "ana@empresa.test",
      telefone: "71987776666",
    }));
    expect(mockAtualizarCliente).not.toHaveBeenCalled();
  });

  it("não persiste endereço vazio", async () => {
    await expect(saveRecipientAddress(base, "email", "  ")).rejects.toThrow(/endereço válido/i);
    expect(mockBuscarCliente).not.toHaveBeenCalled();
  });
});
