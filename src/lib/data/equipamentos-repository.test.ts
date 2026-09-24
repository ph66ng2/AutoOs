import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { SupabaseEquipamentosRepository } from "@/lib/data/equipamentos-repository";
import { OnlineDataError, type SupabaseOnlineSession } from "@/lib/data/clientes-repository";

const companyId = "11111111-1111-4111-8111-111111111111";
const equipmentId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";
const contactId = "44444444-4444-4444-8444-444444444444";
const session: SupabaseOnlineSession = {
  supabaseUrl: "https://staging.example.supabase.co",
  publishableKey: "sb_publishable_test",
  accessToken: "synthetic-token",
  companyId,
};

const equipmentRow = {
  id: equipmentId,
  empresa_id: companyId,
  serial_number: "SN-INFO-001",
  marca: "Zebra",
  modelo: "ZD421",
  tipo: "IMPRESSORA",
  data_entrada: "2026-09-24",
  cliente_id: clientId,
  cliente_nome: "Cliente de teste",
  cliente_documento: "12345678000190",
  responsavel_contato_id: contactId,
  responsavel_nome: "Contato de teste",
  responsavel_email: "contato@example.test",
  responsavel_telefone: "71900000000",
  atualizado_em: "2026-09-24T10:00:00.000Z",
};

describe("SupabaseEquipamentosRepository — aba Informações", () => {
  it("cria vínculo de cliente/contato por UUID e persiste os snapshots", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([equipmentRow]), { status: 201 }));
    const repository = new SupabaseEquipamentosRepository(session, fetcher);

    await repository.criar({
      serial_number: equipmentRow.serial_number,
      marca: equipmentRow.marca,
      modelo: equipmentRow.modelo,
      tipo: equipmentRow.tipo,
      data_entrada: equipmentRow.data_entrada,
      cliente_id: clientId,
      cliente_nome: equipmentRow.cliente_nome,
      cliente_documento: equipmentRow.cliente_documento,
      responsavel_contato_id: contactId,
      responsavel_nome: equipmentRow.responsavel_nome,
      responsavel_email: equipmentRow.responsavel_email,
      responsavel_telefone: equipmentRow.responsavel_telefone,
    });

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain("/rest/v1/equipamentos?");
    expect(init?.headers).toMatchObject({ apikey: session.publishableKey, Authorization: "Bearer synthetic-token" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      empresa_id: companyId,
      cliente_id: clientId,
      cliente_documento: equipmentRow.cliente_documento,
      responsavel_contato_id: contactId,
      responsavel_nome: equipmentRow.responsavel_nome,
      responsavel_email: equipmentRow.responsavel_email,
      responsavel_telefone: equipmentRow.responsavel_telefone,
      status: "RECEBIDO",
    });
  });

  it("atualiza snapshots de contato e mantém o token otimista de concorrência", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([equipmentRow]), { status: 200 }));
    const repository = new SupabaseEquipamentosRepository(session, fetcher);

    await repository.atualizar(equipmentId, {
      serial_number: equipmentRow.serial_number,
      marca: equipmentRow.marca,
      modelo: equipmentRow.modelo,
      tipo: equipmentRow.tipo,
      data_entrada: equipmentRow.data_entrada,
      cliente_id: clientId,
      responsavel_contato_id: contactId,
      responsavel_nome: "Contato atualizado",
      responsavel_email: "novo@example.test",
      responsavel_telefone: "71911111111",
    }, equipmentRow.atualizado_em);

    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toContain(`id=eq.${equipmentId}`);
    expect(url).toContain(`empresa_id=eq.${companyId}`);
    expect(url).toContain(`atualizado_em=eq.${encodeURIComponent(equipmentRow.atualizado_em)}`);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      responsavel_contato_id: contactId,
      responsavel_nome: "Contato atualizado",
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("empresa_id");
  });

  it("rejeita IDs numéricos de contato antes da rede e resposta fora do tenant", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([{ ...equipmentRow, empresa_id: "55555555-5555-4555-8555-555555555555" }]), { status: 200 }));
    const repository = new SupabaseEquipamentosRepository(session, fetcher);
    const input = {
      serial_number: equipmentRow.serial_number,
      marca: equipmentRow.marca,
      modelo: equipmentRow.modelo,
      tipo: equipmentRow.tipo,
      data_entrada: equipmentRow.data_entrada,
      cliente_id: clientId,
      responsavel_contato_id: 42,
    } as never;

    await expect(repository.criar(input)).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "INVALID_DATA" });
    expect(fetcher).not.toHaveBeenCalled();

    await expect(repository.listar()).rejects.toMatchObject<Partial<OnlineDataError>>({ code: "RLS_DENIED" });
  });
});
