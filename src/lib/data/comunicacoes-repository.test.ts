import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { OnlineDataError, type SupabaseOnlineSession } from "@/lib/data/clientes-repository";
import { SupabaseComunicacoesRepository } from "@/lib/data/comunicacoes-repository";

const companyId = "11111111-1111-4111-8111-111111111111";
const equipmentId = "22222222-2222-4222-8222-222222222222";
const communicationId = "33333333-3333-4333-8333-333333333333";
const session: SupabaseOnlineSession = {
  supabaseUrl: "https://staging.example.supabase.co",
  publishableKey: "sb_publishable_test",
  accessToken: "synthetic-token",
  companyId,
};
const communication = {
  id: communicationId,
  empresa_id: companyId,
  equipamento_id: equipmentId,
  tipo: "ORCAMENTO",
  canal: "EMAIL",
  destinatario: "Cliente de teste",
  contato: "cliente@example.test",
  mensagem: "Orçamento encaminhado.",
  enviado: true,
};

describe("SupabaseComunicacoesRepository", () => {
  it("lista apenas o equipamento e a empresa da sessão", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([communication]), { status: 200 }));
    const repository = new SupabaseComunicacoesRepository(session, fetcher);

    await expect(repository.listar(equipmentId)).resolves.toEqual([communication]);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain(`/rest/v1/comunicacoes?select=*&empresa_id=eq.${companyId}&equipamento_id=eq.${equipmentId}`);
    expect(init?.headers).toMatchObject({ apikey: session.publishableKey, Authorization: `Bearer ${session.accessToken}` });
  });

  it("deriva empresa da sessão, verifica equipamento e grava um envio sintético", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: equipmentId, empresa_id: companyId }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([communication]), { status: 201 }));
    const repository = new SupabaseComunicacoesRepository(session, fetcher);

    await repository.registrar({
      empresa_id: "55555555-5555-4555-8555-555555555555",
      equipamento_id: equipmentId,
      tipo: "ORCAMENTO",
      canal: "EMAIL",
      destinatario: " Cliente de teste ",
      contato: " cliente@example.test ",
      mensagem: " Orçamento encaminhado. ",
      enviado: true,
    });

    expect(String(fetcher.mock.calls[0]?.[0])).toContain(`/rest/v1/equipamentos?select=id%2Cempresa_id&id=eq.${equipmentId}&empresa_id=eq.${companyId}`);
    const payload = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(payload).toMatchObject({ empresa_id: companyId, equipamento_id: equipmentId, tipo: "ORCAMENTO", enviado: true });
    expect(payload).not.toHaveProperty("id");
    expect(payload).not.toHaveProperty("criado_em");
  });

  it("bloqueia referência a equipamento de outra empresa antes do insert", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("[]", { status: 200 }));
    const repository = new SupabaseComunicacoesRepository(session, fetcher);

    await expect(repository.registrar({
      equipamento_id: equipmentId,
      tipo: "MANUAL",
      canal: "EMAIL",
      destinatario: "Cliente",
      contato: "cliente@example.test",
      mensagem: "Texto",
      enviado: false,
    })).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "RLS_DENIED" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("recusa UUID inválido e resposta de outro tenant sem expor credenciais", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ ...communication, empresa_id: "55555555-5555-4555-8555-555555555555" }]), { status: 200 }));
    const repository = new SupabaseComunicacoesRepository(session, fetcher);

    await expect(repository.listar(7)).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "INVALID_DATA" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(repository.listar(equipmentId)).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "RLS_DENIED" });
  });

  it("não aceita dados incompletos de comunicação", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const repository = new SupabaseComunicacoesRepository(session, fetcher);
    await expect(repository.registrar({
      equipamento_id: equipmentId,
      tipo: "MANUAL",
      canal: "SMS",
      destinatario: "Cliente",
      contato: "cliente@example.test",
      mensagem: "Texto",
      enviado: false,
    })).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "INVALID_DATA" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
