import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Equipamento } from "@/types";

const mocks = vi.hoisted(() => ({
  atualizarCliente: vi.fn(),
  buscarCliente: vi.fn(),
  atualizarContato: vi.fn(),
  carregarClientes: vi.fn(),
  carregarContatos: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@/lib/runtime-mode", () => ({ IS_SAAS_BUILD: true }));
vi.mock("@/lib/data/clientes-repository", () => ({ carregarRepositorioClientes: (...args: unknown[]) => mocks.carregarClientes(...args) }));
vi.mock("@/lib/data/cliente-contatos-repository", () => ({ carregarRepositorioClienteContatos: (...args: unknown[]) => mocks.carregarContatos(...args) }));

import { saveRecipientAddress } from "@/lib/recipient-persistence";

const equipment: Equipamento<string> = {
  id: "22222222-2222-4222-8222-222222222222",
  empresa_id: "11111111-1111-4111-8111-111111111111",
  cliente_id: "33333333-3333-4333-8333-333333333333",
  serial_number: "SN-RECIPIENT",
  marca: "Zebra",
  modelo: "ZD421",
  tipo: "IMPRESSORA",
  status: "RECEBIDO",
  data_entrada: "2026-09-24",
  cliente_nome: "Cliente de teste",
  responsavel_contato_id: "44444444-4444-4444-8444-444444444444",
  responsavel_nome: "Pessoa responsável",
  responsavel_email: "responsavel@example.test",
  responsavel_telefone: "71900000000",
};

describe("persistência de destinatário SaaS", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.carregarContatos.mockResolvedValue({ atualizar: mocks.atualizarContato });
    mocks.carregarClientes.mockResolvedValue({ buscar: mocks.buscarCliente, atualizar: mocks.atualizarCliente });
    mocks.buscarCliente.mockResolvedValue({ id: equipment.cliente_id, nome: "Cliente de teste", email: "old@example.test", telefone: "71900000000", ativo: true });
  });

  it("atualiza o contato responsável por UUID mantendo o canal não alterado", async () => {
    await saveRecipientAddress(equipment, "email", "novo@example.test");

    expect(mocks.atualizarContato).toHaveBeenCalledWith(equipment.responsavel_contato_id, {
      empresa_id: equipment.empresa_id,
      cliente_id: equipment.cliente_id,
      nome: "Pessoa responsável",
      email: "novo@example.test",
      telefone: equipment.responsavel_telefone,
    });
    expect(mocks.atualizarCliente).not.toHaveBeenCalled();
  });

  it("atualiza o cliente por UUID quando o equipamento não tem contato responsável separado", async () => {
    await saveRecipientAddress({ ...equipment, responsavel_contato_id: undefined }, "telefone", "71911112222");

    expect(mocks.buscarCliente).toHaveBeenCalledWith(equipment.cliente_id);
    expect(mocks.atualizarCliente).toHaveBeenCalledWith(equipment.cliente_id, expect.objectContaining({
      nome: "Cliente de teste",
      email: "old@example.test",
      telefone: "71911112222",
    }));
  });
});
