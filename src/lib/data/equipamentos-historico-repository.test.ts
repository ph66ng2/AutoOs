import { describe, expect, it, vi } from "vitest";
import type { SupabaseOnlineSession } from "@/lib/data/clientes-repository";
import { SupabaseEquipamentoHistoricoRepository } from "@/lib/data/equipamentos-historico-repository";

const companyId = "10000000-0000-4000-8000-000000000001";
const otherCompanyId = "20000000-0000-4000-8000-000000000001";
const equipmentId = "30000000-0000-4000-8000-000000000001";
const session: SupabaseOnlineSession = {
  supabaseUrl: "https://autoos-staging.supabase.co",
  publishableKey: "sb_publishable_test",
  accessToken: "synthetic-user-token",
  companyId,
};

function equipment(overrides: Record<string, unknown> = {}) {
  return {
    id: equipmentId,
    empresa_id: companyId,
    criado_em: "2026-09-20 10:00:00",
    data_entrada: "2026-09-20",
    data_aprovacao: "2026-09-21T10:00:00.000Z",
    data_reprovacao: "2026-09-19T09:00:00.000Z",
    data_pronto: null,
    data_saida: null,
    ...overrides,
  };
}

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "40000000-0000-4000-8000-000000000001",
    empresa_id: companyId,
    event_type: "EQUIPMENT_STATUS_CORRECTED",
    profile_id: "50000000-0000-4000-8000-000000000001",
    profile_name: "Técnica de teste",
    details: JSON.stringify({
      equipment_id: equipmentId,
      old_status: "VERIFICADO",
      new_status: "EM_VERIFICACAO",
      reason: "Correção solicitada em fixture sintética.",
    }),
    success: true,
    created_at: "2026-09-22T10:00:00.000Z",
    occurred_at: "2026-09-22T10:00:00.000Z",
    ...overrides,
  };
}

function createRepository(responses: Record<string, unknown[]>) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const table = url.pathname.split("/").at(-1) ?? "";
    return {
      ok: true,
      status: 200,
      json: async () => responses[table] ?? [],
    } as Response;
  }) as unknown as typeof fetch;
  return { repository: new SupabaseEquipamentoHistoricoRepository(session, fetcher), calls, fetcher };
}

describe("SupabaseEquipamentoHistoricoRepository", () => {
  it("combina etapas existentes e auditoria SaaS em ordem, sem duplicar correções", async () => {
    const { repository, calls } = createRepository({
      equipamentos: [equipment()],
      verificacoes: [
        {
          id: "60000000-0000-4000-8000-000000000001",
          empresa_id: companyId,
          equipamento_id: equipmentId,
          data_inicio: "2026-09-18T10:00:00",
          data_fim: "2026-09-19T10:00:00",
        },
        {
          id: "60000000-0000-4000-8000-000000000002",
          empresa_id: companyId,
          equipamento_id: equipmentId,
          data_inicio: "2026-09-21T09:00:00",
          data_fim: "2026-09-21T11:00:00",
        },
      ],
      security_audit_log: [
        auditRow(),
        auditRow({
          id: "40000000-0000-4000-8000-000000000002",
          event_type: "SAAS_SENSITIVE_MUTATION",
          details: JSON.stringify({
            table: "equipamentos",
            operation: "UPDATE",
            record_id: equipmentId,
            old_status: "VERIFICADO",
            new_status: "EM_VERIFICACAO",
          }),
          occurred_at: "2026-09-22T10:00:00.400Z",
        }),
        auditRow({
          id: "40000000-0000-4000-8000-000000000003",
          event_type: "SAAS_SENSITIVE_MUTATION",
          details: JSON.stringify({
            table: "equipamentos",
            operation: "UPDATE",
            record_id: equipmentId,
            old_status: "AGUARDANDO_APROVACAO",
            new_status: "APROVADO",
          }),
          occurred_at: "2026-09-23T10:00:00.000Z",
        }),
      ],
    });

    const history = await repository.listar(equipmentId);
    expect(history.map(({ status }) => status)).toEqual([
      "RECEBIDO",
      "REPROVADO",
      "VERIFICADO",
      "EM_VERIFICACAO",
      "APROVADO",
    ]);
    expect(history.filter(({ tipo }) => tipo === "CORRECAO_STATUS")).toHaveLength(1);
    expect(history.find(({ tipo }) => tipo === "CORRECAO_STATUS")).toMatchObject({
      data: "2026-09-22T10:00:00.000Z",
      status_anterior: "VERIFICADO",
      status: "EM_VERIFICACAO",
      motivo: "Correção solicitada em fixture sintética.",
      autor: "Técnica de teste",
      data_confiavel: true,
    });
    expect(history.find(({ status }) => status === "VERIFICADO")?.data).toBe("2026-09-21T11:00:00Z");
    expect(history.find(({ status }) => status === "REPROVADO")).toMatchObject({
      data: "2026-09-20T10:00:00Z",
      data_confiavel: false,
    });
    expect(history.find(({ status }) => status === "RECEBIDO")).not.toHaveProperty("autor");
    expect(history.every((event, index) => index === 0 || history[index - 1]!.data <= event.data)).toBe(true);

    expect(calls).toHaveLength(3);
    for (const { url, init } of calls) {
      expect(url.searchParams.get("empresa_id")).toBe(`eq.${companyId}`);
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${session.accessToken}` });
    }
    expect(calls.find(({ url }) => url.pathname.endsWith("security_audit_log"))?.url.searchParams.get("details"))
      .toBe(`ilike.*${equipmentId}*`);
  });

  it("não retorna dados se uma resposta incluir evento de outra empresa", async () => {
    const { repository } = createRepository({
      equipamentos: [equipment()],
      verificacoes: [],
      security_audit_log: [auditRow({ empresa_id: otherCompanyId })],
    });

    await expect(repository.listar(equipmentId)).rejects.toMatchObject({
      code: "RLS_DENIED",
    });
  });

  it("retorna lista vazia quando equipamento não tem etapas nem eventos auditados", async () => {
    const { repository } = createRepository({
      equipamentos: [equipment({ criado_em: null, data_entrada: null, data_aprovacao: null, data_reprovacao: null })],
      verificacoes: [],
      security_audit_log: [],
    });

    await expect(repository.listar(equipmentId)).resolves.toEqual([]);
  });

  it("rejeita UUID local antes de consultar o serviço Online", async () => {
    const { repository, fetcher } = createRepository({});

    await expect(repository.listar(42)).rejects.toMatchObject({ code: "INVALID_DATA" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
