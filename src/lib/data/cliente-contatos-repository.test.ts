import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { SupabaseClienteContatosRepository } from "@/lib/data/cliente-contatos-repository";
import { OnlineDataError, type SupabaseOnlineSession } from "@/lib/data/clientes-repository";

const companyId = "11111111-1111-4111-8111-111111111111";
const clientId = "22222222-2222-4222-8222-222222222222";
const contactId = "33333333-3333-4333-8333-333333333333";
const session: SupabaseOnlineSession = {
  supabaseUrl: "https://staging.example.supabase.co",
  publishableKey: "sb_publishable_test",
  accessToken: "synthetic-token",
  companyId,
};

function result(id = contactId) {
  return [{ id, empresa_id: companyId, cliente_id: clientId, nome: "Ana", ativo: true }];
}

describe("SupabaseClienteContatosRepository", () => {
  it("lista apenas contatos ativos do cliente e tenant da sessão", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(result()), { status: 200 }));
    const repository = new SupabaseClienteContatosRepository(session, fetcher);

    await expect(repository.listar(clientId)).resolves.toHaveLength(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain(`empresa_id=eq.${companyId}&cliente_id=eq.${clientId}&ativo=is.true`);
    expect(init?.headers).toMatchObject({ apikey: session.publishableKey, Authorization: "Bearer synthetic-token" });
  });

  it("ignora empresa_id informado pelo formulário ao criar e atualizar", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(result()), { status: 200 }));
    const repository = new SupabaseClienteContatosRepository(session, fetcher);

    await repository.criar({ empresa_id: "44444444-4444-4444-8444-444444444444", cliente_id: clientId, nome: "Ana" });
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toMatchObject({ empresa_id: companyId, cliente_id: clientId });

    await repository.atualizar(contactId, { empresa_id: "44444444-4444-4444-8444-444444444444", cliente_id: clientId, nome: "Ana" });
    expect(String(fetcher.mock.calls[1]![0])).toContain(`empresa_id=eq.${companyId}`);
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).not.toHaveProperty("empresa_id");
  });

  it("recusa IDs não UUID antes da rede e mostra falta de serviço sem expor tokens", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network down"));
    const repository = new SupabaseClienteContatosRepository(session, fetcher);
    await expect(repository.listar(12)).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "INVALID_SESSION" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(repository.inativar(contactId)).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "ONLINE_UNAVAILABLE" });
  });

  it("não mostra sucesso quando RLS ou concorrência retorna zero linhas", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response("[]", { status: 200 }));
    const repository = new SupabaseClienteContatosRepository(session, fetcher);
    await expect(repository.atualizar(contactId, { empresa_id: companyId, cliente_id: clientId, nome: "Ana", atualizado_em: "2026-09-23T00:00:00" })).rejects.toThrow(/mudou|não está disponível/);
    await expect(repository.inativar(contactId)).rejects.toThrow(/não pôde ser inativado/);
  });

  it("recusa uma resposta de contato atribuída a outro tenant ou cliente", async () => {
    const foreignTenant = new SupabaseClienteContatosRepository(session, vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([{ ...result()[0], empresa_id: "55555555-5555-4555-8555-555555555555" }]), { status: 200 }),
    ));
    const foreignClient = new SupabaseClienteContatosRepository(session, vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify([{ ...result()[0], cliente_id: "55555555-5555-4555-8555-555555555555" }]), { status: 200 }),
    ));

    await expect(foreignTenant.listar(clientId)).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "RLS_DENIED" });
    await expect(foreignClient.listar(clientId)).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "RLS_DENIED" });
  });
});
