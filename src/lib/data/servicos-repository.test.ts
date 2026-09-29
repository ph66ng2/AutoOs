import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { OnlineDataError, type SupabaseOnlineSession } from "@/lib/data/clientes-repository";
import { SupabaseServicosRepository } from "@/lib/data/servicos-repository";

const companyId = "11111111-1111-4111-8111-111111111111";
const serviceId = "22222222-2222-4222-8222-222222222222";
const session: SupabaseOnlineSession = {
  supabaseUrl: "https://staging.example.supabase.co",
  publishableKey: "sb_publishable_test",
  accessToken: "synthetic-token",
  companyId,
};
const service = {
  id: serviceId,
  empresa_id: companyId,
  nome: "Limpeza técnica",
  descricao: "Cabeça térmica",
  preco_padrao: 150,
  ativo: true,
  criado_em: "2026-09-24T10:00:00.000Z",
  atualizado_em: "2026-09-24T10:00:00.000Z",
};

describe("SupabaseServicosRepository", () => {
  it("busca e pagina dentro do tenant, incluindo total e valores reservados na busca", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([service]), {
      status: 206,
      headers: { "Content-Range": "10-19/23" },
    }));
    const repository = new SupabaseServicosRepository(session, fetcher);

    const result = await repository.listar('cabeça, "térmica" (zebra)', true, 1);

    const [rawUrl, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(rawUrl));
    expect(url.pathname).toBe("/rest/v1/servicos_catalogo");
    expect(url.searchParams.get("empresa_id")).toBe(`eq.${companyId}`);
    expect(url.searchParams.get("ativo")).toBe("eq.true");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("offset")).toBe("10");
    expect(url.searchParams.get("order")).toBe("nome.asc,id.asc");
    expect(url.searchParams.get("or")).toContain('nome.ilike."%cabeça, \\\"térmica\\\" (zebra)%"');
    expect(init?.headers).toMatchObject({
      apikey: session.publishableKey,
      Authorization: "Bearer synthetic-token",
      Prefer: "count=exact",
    });
    expect(result).toEqual({ items: [service], total: 23 });
  });

  it("cria apenas campos autorizados e deriva empresa_id da sessão", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([service]), { status: 201 }));
    const repository = new SupabaseServicosRepository(session, fetcher);

    await repository.criar({
      nome: "  Limpeza técnica  ",
      descricao: "  Cabeça térmica  ",
      preco_padrao: 150,
      ...({ empresa_id: "99999999-9999-4999-8999-999999999999", pecas_sugeridas: [{ produto_id: "bogus" }] } as object),
    });

    const [, init] = fetcher.mock.calls[0]!;
    expect(JSON.parse(String(init?.body))).toEqual({
      nome: "Limpeza técnica",
      descricao: "Cabeça térmica",
      preco_padrao: 150,
      empresa_id: companyId,
      ativo: true,
    });
  });

  it("atualiza com filtro de tenant e token otimista de concorrência", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([service]), { status: 200 }));
    const repository = new SupabaseServicosRepository(session, fetcher);

    await repository.atualizar(serviceId, {
      nome: service.nome,
      descricao: service.descricao,
      preco_padrao: service.preco_padrao,
      atualizado_em: service.atualizado_em,
    });

    const [rawUrl, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(rawUrl));
    expect(url.searchParams.get("id")).toBe(`eq.${serviceId}`);
    expect(url.searchParams.get("empresa_id")).toBe(`eq.${companyId}`);
    expect(url.searchParams.get("atualizado_em")).toBe(`eq.${service.atualizado_em}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({ nome: service.nome, preco_padrao: service.preco_padrao });
  });

  it("informa conflito quando a versão do serviço já mudou", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("[]", { status: 200 }));
    const repository = new SupabaseServicosRepository(session, fetcher);

    await expect(repository.atualizar(serviceId, {
      nome: service.nome,
      preco_padrao: service.preco_padrao,
      atualizado_em: service.atualizado_em,
    })).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "CONFLICT" });
  });

  it("desativa logicamente e rejeita IDs numéricos antes da rede", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ id: serviceId, empresa_id: companyId }]), { status: 200 }));
    const repository = new SupabaseServicosRepository(session, fetcher);

    await expect(repository.atualizar(42, { nome: "Serviço", preco_padrao: 0 })).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "INVALID_DATA" });
    expect(fetcher).not.toHaveBeenCalled();

    await repository.desativar(serviceId);
    const [rawUrl, init] = fetcher.mock.calls[0]!;
    const url = new URL(String(rawUrl));
    expect(url.searchParams.get("empresa_id")).toBe(`eq.${companyId}`);
    expect(url.searchParams.get("ativo")).toBe("eq.true");
    expect(JSON.parse(String(init?.body))).toEqual({ ativo: false, atualizado_em: expect.any(String) });
  });

  it("nega resposta de outro tenant e falhas sem total para a paginação", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ ...service, empresa_id: "99999999-9999-4999-8999-999999999999" }]), {
        status: 200,
        headers: { "Content-Range": "0-0/1" },
      }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }));
    const repository = new SupabaseServicosRepository(session, fetcher);

    await expect(repository.listar()).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "RLS_DENIED" });
    await expect(repository.listar()).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "ONLINE_UNAVAILABLE" });
  });

  it("traduz sessão expirada, duplicidade e negação de RLS em erros recuperáveis", async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "23505" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: "42501" }), { status: 403 }));
    const repository = new SupabaseServicosRepository(session, fetcher);

    await expect(repository.listar()).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "SESSION_EXPIRED" });
    await expect(repository.criar({ nome: "Limpeza técnica", preco_padrao: 150 })).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "CONFLICT" });
    await expect(repository.desativar(serviceId)).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "RLS_DENIED" });
  });
});
