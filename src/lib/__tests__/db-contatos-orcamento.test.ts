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

  it("gera a prévia sem aceitar empresa enviada pela tela", async () => {
    mockInvoke.mockResolvedValue({ empresa_id: 7, token: "opaque", clientes: 2 });

    await db.previsualizarRegularizacaoLegados();

    expect(mockInvoke).toHaveBeenCalledWith("previsualizar_regularizacao_legados");
  });

  it("envia token e PIN explicitamente ao executar a regularização", async () => {
    mockInvoke.mockResolvedValue({ empresa_id: 7, clientes: 2, equipamentos: 3 });

    await db.executarRegularizacaoLegados("token-opaco", "2468");

    expect(mockInvoke).toHaveBeenCalledWith("executar_regularizacao_legados", {
      tokenDaPrevia: "token-opaco",
      pinAdministrativo: "2468",
    });
  });

  it("lista empresas de vínculo sem receber identidade ou empresa da tela", async () => {
    mockInvoke.mockResolvedValue({ perfil_id: 1, perfil_nome: "Administrador Local", empresas_ativas: [] });

    await db.previsualizarVinculoEmpresaPerfil();

    expect(mockInvoke).toHaveBeenCalledWith("previsualizar_vinculo_empresa_perfil");
  });

  it("envia empresa escolhida e PIN explícito no bootstrap do perfil", async () => {
    mockInvoke.mockResolvedValue({ empresa_id: 7, empresa_nome: "AutoOS", empresa_criada: false });

    await db.vincularPerfilAtivoEmpresa({ empresa_id: 7 }, "2468");

    expect(mockInvoke).toHaveBeenCalledWith("vincular_perfil_ativo_empresa", {
      input: { empresa_id: 7 },
      pinAdministrativo: "2468",
    });
  });
});
