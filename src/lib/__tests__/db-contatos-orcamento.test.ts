import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AjusteOrcamentoInput, AprovarOrcamentoInput, ClienteContatoInput } from "@/types";

const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { db } from "@/lib/db";

describe("db — contatos e contratos de orçamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista contatos por cliente e empresa", async () => {
    mockInvoke.mockResolvedValue([]);

    await db.listarClienteContatos(11, 7);

    expect(mockInvoke).toHaveBeenCalledWith("listar_cliente_contatos", {
      clienteId: 11,
      empresaId: 7,
    });
  });

  it("mantém o payload de criação de contato explícito e sem inferência", async () => {
    const input: ClienteContatoInput = {
      empresa_id: 7,
      cliente_id: 11,
      nome: "Responsável Teste",
      email: "responsavel@teste.local",
      telefone: "71999999999",
    };
    mockInvoke.mockResolvedValue({ ...input, id: 20, ativo: true });

    await db.criarClienteContato(input);

    expect(mockInvoke).toHaveBeenCalledWith("criar_cliente_contato", { input });
  });

  it("inativa contato sem chamar exclusão física", async () => {
    mockInvoke.mockResolvedValue({ id: 20, empresa_id: 7, cliente_id: 11, nome: "Teste", ativo: false });

    await db.inativarClienteContato(20, 7);

    expect(mockInvoke).toHaveBeenCalledWith("inativar_cliente_contato", {
      id: 20,
      empresaId: 7,
    });
  });

  it("envia observações e pagamento no ajuste de orçamento", async () => {
    const input: AjusteOrcamentoInput = {
      empresa_id: 7,
      equipamento_id: 20,
      servicos: [],
      pecas: [],
      custo_total: 125,
      observacoes: "Serviço aprovado pelo cliente",
      forma_pagamento_codigo: "OUTRO",
      forma_pagamento_detalhe: "Faturamento mensal",
    };
    mockInvoke.mockResolvedValue({ id: 8, equipamento_id: 20 });

    await db.atualizarServicosVerificacao(input, 3);

    expect(mockInvoke).toHaveBeenCalledWith("atualizar_servicos_verificacao", {
      equipamentoId: 20,
      servicosJson: "[]",
      pecasJson: "[]",
      custoTotal: 125,
      profileId: 3,
      divergence: false,
      observacoes: "Serviço aprovado pelo cliente",
      formaPagamentoCodigo: "OUTRO",
      formaPagamentoDetalhe: "Faturamento mensal",
      empresaId: 7,
    });
  });

  it("envia aprovação como uma única operação com token e pagamento", async () => {
    const input: AprovarOrcamentoInput = {
      empresa_id: 7,
      equipamento_id: 20,
      expected_updated_em: "2026-09-10T12:00:00",
      pagamento: { codigo: "PIX", detalhe: null },
    };
    mockInvoke.mockResolvedValue({ id: 20, status: "APROVADO" });

    await db.aprovarOrcamento(input);

    expect(mockInvoke).toHaveBeenCalledWith("aprovar_orcamento", { input });
  });
});
