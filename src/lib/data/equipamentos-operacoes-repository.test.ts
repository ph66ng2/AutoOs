import { describe, expect, it, vi } from "vitest";
import {
  calcularPrazoAprovacaoOnline,
  SupabaseEquipmentOperationsRepository,
} from "@/lib/data/equipamentos-operacoes-repository";
import type { SupabaseOnlineSession } from "@/lib/data/clientes-repository";

const tenantId = "11000000-0000-4000-8000-000000000001";
const otherTenantId = "11000000-0000-4000-8000-000000000002";
const equipmentId = "22000000-0000-4000-8000-000000000001";
const session: SupabaseOnlineSession = {
  supabaseUrl: "https://autoos-test.supabase.co",
  publishableKey: "sb_publishable_test_only",
  accessToken: "user.jwt.test",
  companyId: tenantId,
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const equipment = {
  id: equipmentId,
  empresa_id: tenantId,
  serial_number: "TEST-SN",
  marca: "Marca",
  modelo: "Modelo",
  tipo: "IMPRESSORA",
  status: "AGUARDANDO_APROVACAO",
  data_entrada: "2026-09-24",
  atualizado_em: "2026-09-24T12:00:00",
};

describe("SupabaseEquipmentOperationsRepository", () => {
  it("loads verification and service catalog through tenant-scoped reads", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response([{ empresa_id: tenantId, equipamento_id: equipmentId, tecnico_nome: "Ivan", problema_relatado: "Falha", id: "33000000-0000-4000-8000-000000000001" }]))
      .mockResolvedValueOnce(response([{ empresa_id: tenantId, id: "44000000-0000-4000-8000-000000000001", nome: "Limpeza", preco_padrao: 35, ativo: true }]));
    const repository = new SupabaseEquipmentOperationsRepository(session, fetcher);

    const verification = await repository.getVerification(equipmentId);
    const services = await repository.listActiveServices();

    expect(verification?.tecnico_nome).toBe("Ivan");
    expect(services[0]?.nome).toBe("Limpeza");
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(`empresa_id=eq.${tenantId}`);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain(`empresa_id=eq.${tenantId}`);
    expect(fetcher.mock.calls.every(([, init]) => (init?.headers as Record<string, string>).Authorization === `Bearer ${session.accessToken}`)).toBe(true);
  });

  it("finalizes verification with one RPC and never sends a tenant, profile, or privileged key", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ equipment, verification: { ...equipment, id: "33000000-0000-4000-8000-000000000001", equipamento_id: equipmentId, tecnico_nome: "Ivan", problema_relatado: "Falha" } }));
    const repository = new SupabaseEquipmentOperationsRepository(session, fetcher);

    await repository.finalizeVerification({
      equipmentId,
      expectedUpdatedAt: equipment.atualizado_em,
      approvalDeadline: "2026-09-29",
      verification: {
        equipamento_id: equipmentId,
        tecnico_nome: "Ivan",
        problema_relatado: "Falha",
        diagnostico: "Cabeça térmica",
        itens_verificados: "[]",
        servicos_necessarios: JSON.stringify([{ id: "1", descricao: "Limpeza", valor: 35, catalogo_id: "44000000-0000-4000-8000-000000000001" }]),
        pecas_necessarias: "[]",
        custo_estimado_mao_obra: 35,
        custo_estimado_pecas: 0,
        custo_total: 35,
        tempo_estimado: 0,
        concluida: true,
        observacoes: "",
      },
    });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain("/rpc/saas_finalize_equipment_verification");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.p_equipment_id).toBe(equipmentId);
    expect(body.p_verification).toMatchObject({
      tecnico_nome: "Ivan",
      servicos_necessarios: [{ descricao: "Limpeza", valor: 35 }],
    });
    expect(body).not.toHaveProperty("empresa_id");
    expect(body).not.toHaveProperty("profile_id");
    expect(JSON.stringify(init?.headers)).not.toMatch(/service.role|secret/i);
  });

  it("maps concurrency and server authorization errors to actionable UI messages", async () => {
    const conflictFetch = vi.fn<typeof fetch>().mockResolvedValue(response({ code: "40001", message: "stale" }, 400));
    const conflictRepository = new SupabaseEquipmentOperationsRepository(session, conflictFetch);
    await expect(conflictRepository.changeStatus({
      equipmentId,
      expectedUpdatedAt: equipment.atualizado_em,
      status: "EM_VERIFICACAO",
    })).rejects.toMatchObject({ code: "CONFLICT" });

    const deniedFetch = vi.fn<typeof fetch>().mockResolvedValue(response({ code: "42501", message: "denied" }, 403));
    const deniedRepository = new SupabaseEquipmentOperationsRepository(session, deniedFetch);
    await expect(deniedRepository.approveQuote({
      equipmentId,
      expectedUpdatedAt: equipment.atualizado_em,
      payment: { codigo: "PIX" },
    })).rejects.toMatchObject({ code: "RLS_DENIED" });
  });

  it("rejects malformed equipment IDs and refuses data returned for another tenant", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ ...equipment, empresa_id: otherTenantId }));
    const repository = new SupabaseEquipmentOperationsRepository(session, fetcher);
    await expect(repository.changeStatus({
      equipmentId: "not-a-uuid",
      expectedUpdatedAt: equipment.atualizado_em,
      status: "EM_VERIFICACAO",
    })).rejects.toMatchObject({ code: "INVALID_DATA" });
    expect(fetcher).not.toHaveBeenCalled();

    await expect(repository.approveQuote({
      equipmentId,
      expectedUpdatedAt: equipment.atualizado_em,
      payment: { codigo: "PIX" },
    })).rejects.toMatchObject({ code: "RLS_DENIED" });
  });

  it("calculates the approval deadline using business days without UTC date drift", () => {
    expect(calcularPrazoAprovacaoOnline(3, new Date(2026, 8, 25, 23, 30))).toBe("2026-09-30");
  });
});
