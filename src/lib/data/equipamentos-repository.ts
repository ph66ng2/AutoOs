import { db } from "@/lib/db";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import {
  OnlineDataError,
  sessionFromSaasSession,
  type SupabaseOnlineSession,
} from "@/lib/data/clientes-repository";
import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import type { Equipamento, EquipamentoId } from "@/types";

export type EquipamentoInput<Id extends EquipamentoId = number> = Omit<Equipamento<Id>, "id" | "empresa_id" | "criado_em" | "atualizado_em">;

export interface EquipamentosRepository<Id extends EquipamentoId = number> {
  listar(busca?: string, status?: string): Promise<Equipamento<Id>[]>;
  buscarPorSerial(serial: string): Promise<Equipamento<Id>[]>;
  criar(equipamento: EquipamentoInput<Id>): Promise<Equipamento<Id>>;
  atualizar(id: Id, equipamento: EquipamentoInput<Id>, atualizadoEm?: string): Promise<Equipamento<Id>>;
  deletar(id: Id): Promise<void>;
}

type FetchLike = typeof fetch;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EQUIPMENT_FIELDS = [
  "serial_number", "patrimonio", "marca", "modelo", "tipo", "defeito_relatado",
  "acessorios", "acessorios_outros", "paginas_impressas", "tecnologia", "conectividade",
  "data_entrada", "proprietario", "preco_compra", "preco_venda", "observacoes",
  "cliente_id", "cliente_nome", "cliente_documento", "cliente_telefone", "cliente_email",
  "responsavel_contato_id", "responsavel_nome", "responsavel_email", "responsavel_telefone",
] as const;

function legacyId(id: EquipamentoId): number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Um identificador SaaS não pode ser encaminhado ao banco local.");
  }
  return id;
}

function allowedPayload(input: EquipamentoInput, includeInitialStatus: boolean): Record<string, unknown> {
  const payload = Object.fromEntries(EQUIPMENT_FIELDS.flatMap((field) => {
    const value = input[field];
    return value === undefined ? [] : [[field, value]];
  }));

  if (includeInitialStatus) payload.status = "RECEBIDO";
  if (payload.cliente_id != null && (typeof payload.cliente_id !== "string" || !UUID_PATTERN.test(payload.cliente_id))) {
    throw new OnlineDataError("INVALID_DATA", "O cliente selecionado não possui um identificador Online válido.");
  }
  if (payload.responsavel_contato_id != null && (typeof payload.responsavel_contato_id !== "string" || !UUID_PATTERN.test(payload.responsavel_contato_id))) {
    throw new OnlineDataError("INVALID_DATA", "O contato responsável não possui um identificador Online válido.");
  }
  return payload;
}

function assertTenantRows(rows: Equipamento<string>[], session: SupabaseOnlineSession): Equipamento<string>[] {
  for (const row of rows) {
    if (typeof row.id !== "string" || !UUID_PATTERN.test(row.id) || row.empresa_id !== session.companyId) {
      throw new OnlineDataError("RLS_DENIED", "A resposta Online contém um equipamento fora do tenant autenticado.");
    }
  }
  return rows;
}

function filterSearch<Id extends EquipamentoId>(rows: Equipamento<Id>[], busca?: string): Equipamento<Id>[] {
  const term = busca?.trim().toLocaleLowerCase("pt-BR");
  if (!term) return rows;
  return rows.filter((equipment) => [
    equipment.serial_number, equipment.patrimonio, equipment.marca, equipment.modelo,
    equipment.tipo, equipment.cliente_nome, equipment.cliente_telefone,
  ].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
}

function equipmentHttpError(status: number, code: string | undefined, method: string | undefined): OnlineDataError {
  if (status === 401) return new OnlineDataError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
  if (status === 403 || code === "42501") return new OnlineDataError("RLS_DENIED", "Seu acesso a estes equipamentos foi negado pela empresa.");
  if (code === "23503" && method === "DELETE") return new OnlineDataError("CONFLICT", "Este equipamento possui dados operacionais vinculados e não pode ser excluído.");
  if (code === "23503") return new OnlineDataError("INVALID_DATA", "O cliente selecionado não está mais disponível para esta empresa.");
  if (status === 409 || code === "23505") return new OnlineDataError("CONFLICT", "Já existe um equipamento com este patrimônio nesta empresa.");
  if (status === 400 && code?.startsWith("23")) return new OnlineDataError("INVALID_DATA", "Os dados do equipamento não atendem às regras do cadastro.");
  return new OnlineDataError("ONLINE_UNAVAILABLE", "Não foi possível concluir a operação online. Tente novamente.");
}

export class SupabaseEquipamentosRepository implements EquipamentosRepository<string> {
  constructor(private readonly session: SupabaseOnlineSession, private readonly fetcher: FetchLike = fetch.bind(globalThis)) {}

  private endpoint(query: URLSearchParams): string {
    const serialized = query.toString();
    return `${this.session.supabaseUrl}/rest/v1/equipamentos${serialized ? `?${serialized}` : ""}`;
  }

  private async request<T>(query: URLSearchParams, init: RequestInit): Promise<T[]> {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint(query), {
        ...init,
        headers: {
          apikey: this.session.publishableKey,
          Authorization: `Bearer ${this.session.accessToken}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "A comunicação com o serviço Online falhou. Seus dados do formulário foram mantidos; tente novamente.");
    }

    if (!response.ok) {
      let code: string | undefined;
      try {
        const body = await response.json() as { code?: string };
        code = body.code;
      } catch { /* resposta do serviço sem corpo JSON */ }
      throw equipmentHttpError(response.status, code, init.method);
    }
    if (response.status === 204) return [];
    try {
      return await response.json() as T[];
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma resposta inválida. Tente novamente.");
    }
  }

  async listar(busca?: string, status?: string): Promise<Equipamento<string>[]> {
    const query = new URLSearchParams({ select: "*", empresa_id: `eq.${this.session.companyId}`, order: "criado_em.desc" });
    if (status) query.set("status", `eq.${status}`);
    const rows = await this.request<Equipamento<string>>(query, { method: "GET" });
    return filterSearch(assertTenantRows(rows, this.session), busca);
  }

  async buscarPorSerial(serial: string): Promise<Equipamento<string>[]> {
    return (await this.listar(serial)).filter((equipment) =>
      equipment.serial_number.toLocaleLowerCase("pt-BR").includes(serial.trim().toLocaleLowerCase("pt-BR"))
    );
  }

  async criar(equipamento: EquipamentoInput<string>): Promise<Equipamento<string>> {
    const query = new URLSearchParams({ select: "*" });
    const rows = await this.request<Equipamento<string>>(query, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...allowedPayload(equipamento, true), empresa_id: this.session.companyId }),
    });
    const row = assertTenantRows(rows, this.session)[0];
    if (!row) throw new OnlineDataError("RLS_DENIED", "O equipamento não pôde ser criado para sua empresa.");
    return row;
  }

  async atualizar(id: string, equipamento: EquipamentoInput<string>, atualizadoEm?: string): Promise<Equipamento<string>> {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      throw new OnlineDataError("INVALID_DATA", "O identificador do equipamento Online é inválido.");
    }
    const query = new URLSearchParams({ select: "*", id: `eq.${id}`, empresa_id: `eq.${this.session.companyId}` });
    if (atualizadoEm) query.set("atualizado_em", `eq.${atualizadoEm}`);
    const rows = await this.request<Equipamento<string>>(query, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(allowedPayload(equipamento, false)),
    });
    const row = assertTenantRows(rows, this.session)[0];
    if (!row) throw new OnlineDataError("CONFLICT", "O equipamento mudou ou não está mais disponível. Atualize a lista e tente novamente.");
    return row;
  }

  async deletar(id: string): Promise<void> {
    if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
      throw new OnlineDataError("INVALID_DATA", "O identificador do equipamento Online é inválido.");
    }
    const query = new URLSearchParams({ select: "id", id: `eq.${id}`, empresa_id: `eq.${this.session.companyId}` });
    const rows = await this.request<{ id: string }>(query, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    if (!rows[0]) throw new OnlineDataError("RLS_DENIED", "O equipamento não foi encontrado ou não pode ser excluído.");
  }
}

const tauriEquipamentosRepository: EquipamentosRepository<number> = {
  listar: (busca, status) => db.listarEquipamentos(busca, status),
  buscarPorSerial: (serial) => db.buscarEquipamentosPorSerial(serial),
  criar: (equipamento) => db.criarEquipamento(equipamento),
  atualizar: (id, equipamento) => db.atualizarEquipamento(legacyId(id), equipamento),
  deletar: (id) => db.deletarEquipamento(legacyId(id)),
};

export async function carregarRepositorioEquipamentos<Id extends EquipamentoId = number>(): Promise<EquipamentosRepository<Id>> {
  if (!IS_SAAS_BUILD) return tauriEquipamentosRepository as EquipamentosRepository<Id>;
  const session = await tauriSaasSessionStore.load();
  if (!session) throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão SaaS expirou. Entre novamente para continuar.");
  return new SupabaseEquipamentosRepository(sessionFromSaasSession(session)) as unknown as EquipamentosRepository<Id>;
}

export const repositorioEquipamentosInterno = tauriEquipamentosRepository;
