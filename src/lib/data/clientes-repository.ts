import { db } from "@/lib/db";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import { loadSaasAuthConfiguration, type SaasAuthConfiguration } from "@/lib/saas-auth";
import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import type { Cliente, ClienteId } from "@/types";
import type { SaasSession } from "@/types/saas-auth";

export type ClienteInput = Omit<Cliente, "id">;

export interface ClientesRepository {
  listar(busca?: string): Promise<Cliente[]>;
  buscar(id: ClienteId): Promise<Cliente>;
  criar(cliente: ClienteInput): Promise<Cliente>;
  atualizar(id: ClienteId, cliente: ClienteInput): Promise<Cliente>;
  deletar(id: ClienteId): Promise<void>;
}

export type OnlineDataErrorCode = "ONLINE_UNAVAILABLE" | "SESSION_EXPIRED" | "RLS_DENIED" | "INVALID_SESSION" | "CONFLICT" | "INVALID_DATA";

/** Erro seguro para a UI: nunca inclui URL, token ou payload de autenticação. */
export class OnlineDataError extends Error {
  constructor(public readonly code: OnlineDataErrorCode, message: string) {
    super(message);
    this.name = "OnlineDataError";
  }
}

export interface SupabaseOnlineSession {
  supabaseUrl: string;
  publishableKey: string;
  accessToken: string;
  /** Derivado exclusivamente de app_metadata.company_id no JWT de usuário. */
  companyId: string;
}

type FetchLike = typeof fetch;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENTE_FIELDS = ["nome", "tipo_pessoa", "documento", "razao_social", "nome_fantasia", "inscricao_estadual", "cpf_cnpj", "telefone", "telefone_secundario", "email", "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf", "receber_email", "receber_whatsapp", "observacoes", "ativo"] as const;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function assertPublishableKey(key: string): void {
  if (!key.trim()) throw new OnlineDataError("INVALID_SESSION", "A chave publicável do Supabase não foi configurada.");
  const keyPayload = decodeJwtPayload(key);
  if (keyPayload?.role === "service_role" || /service[_-]?role|secret/i.test(key)) {
    throw new OnlineDataError("INVALID_SESSION", "A configuração SaaS contém uma credencial administrativa proibida no desktop.");
  }
}

/** A leitura da claim preenche INSERT; a autorização continua exclusivamente no RLS. */
export function sessionFromSaasSession(
  session: SaasSession,
  config: SaasAuthConfiguration = loadSaasAuthConfiguration(import.meta.env),
): SupabaseOnlineSession {
  assertPublishableKey(config.publishableKey);
  if (!UUID_PATTERN.test(session.identity.companyId) || !/^https:\/\/[^/]+$/i.test(config.supabaseUrl)) {
    throw new OnlineDataError("INVALID_SESSION", "A sessão SaaS não possui uma identidade de empresa autorizada. Entre novamente.");
  }
  return {
    supabaseUrl: config.supabaseUrl,
    publishableKey: config.publishableKey,
    accessToken: session.accessToken,
    companyId: session.identity.companyId,
  };
}

function clientePayload(cliente: ClienteInput): Record<string, unknown> {
  return Object.fromEntries(CLIENTE_FIELDS.flatMap((field) => {
    const value = cliente[field];
    return value === undefined ? [] : [[field, value]];
  }));
}

function asOnlineError(response: Response): OnlineDataError {
  if (response.status === 401) return new OnlineDataError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
  if (response.status === 403) return new OnlineDataError("RLS_DENIED", "Seu acesso a estes dados foi negado pela empresa.");
  return new OnlineDataError("ONLINE_UNAVAILABLE", "Não foi possível concluir a operação online. Tente novamente.");
}

export class SupabaseClientesRepository implements ClientesRepository {
  constructor(private readonly session: SupabaseOnlineSession, private readonly fetcher: FetchLike = fetch.bind(globalThis)) {}

  private endpoint(query = ""): string {
    return `${this.session.supabaseUrl}/rest/v1/clientes${query}`;
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: { apikey: this.session.publishableKey, Authorization: `Bearer ${this.session.accessToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "A comunicação com o serviço Online falhou. Seus dados do formulário foram mantidos; tente novamente.");
    }
    if (!response.ok) throw asOnlineError(response);
    return (await response.json()) as T;
  }

  async listar(busca?: string): Promise<Cliente[]> {
    const rows = await this.request<Cliente[]>(this.endpoint("?select=*&ativo=is.true&order=criado_em.desc"), { method: "GET" });
    const term = busca?.trim().toLocaleLowerCase("pt-BR");
    if (!term) return rows;
    return rows.filter((cliente) => [cliente.nome, cliente.razao_social, cliente.nome_fantasia, cliente.documento, cliente.cpf_cnpj, cliente.telefone, cliente.email].some((value) => value?.toLocaleLowerCase("pt-BR").includes(term)));
  }

  async buscar(id: ClienteId): Promise<Cliente> {
    const rows = await this.request<Cliente[]>(this.endpoint(`?select=*&id=eq.${encodeURIComponent(String(id))}&limit=1`), { method: "GET" });
    if (!rows[0]) throw new OnlineDataError("RLS_DENIED", "Cliente não encontrado ou indisponível para sua empresa.");
    return rows[0];
  }

  async criar(cliente: ClienteInput): Promise<Cliente> {
    const rows = await this.request<Cliente[]>(this.endpoint(), { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ...clientePayload(cliente), empresa_id: this.session.companyId }) });
    if (!rows[0]) throw new OnlineDataError("RLS_DENIED", "O cliente não pôde ser criado para sua empresa.");
    return rows[0];
  }

  async atualizar(id: ClienteId, cliente: ClienteInput): Promise<Cliente> {
    const rows = await this.request<Cliente[]>(this.endpoint(`?id=eq.${encodeURIComponent(String(id))}`), { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(clientePayload(cliente)) });
    if (!rows[0]) throw new OnlineDataError("RLS_DENIED", "O cliente não pôde ser alterado para sua empresa.");
    return rows[0];
  }

  async deletar(id: ClienteId): Promise<void> {
    const rows = await this.request<Cliente[]>(this.endpoint(`?id=eq.${encodeURIComponent(String(id))}`), { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ ativo: false }) });
    if (!rows[0]) throw new OnlineDataError("RLS_DENIED", "O cliente não pôde ser removido para sua empresa.");
  }
}

const tauriClientesRepository: ClientesRepository = {
  listar: (busca) => db.listarClientes(busca),
  buscar: (id) => db.buscarCliente(id),
  criar: (cliente) => db.criarCliente(cliente),
  atualizar: async (id, cliente) => { await db.atualizarCliente(id, cliente); return db.buscarCliente(id); },
  deletar: (id) => db.deletarCliente(id),
};

/** Sem sessão SaaS, o baseline interno permanece no adapter Tauri. */
export async function carregarRepositorioClientes(): Promise<ClientesRepository> {
  if (!IS_SAAS_BUILD) return tauriClientesRepository;

  const session = await tauriSaasSessionStore.load();
  if (!session) {
    throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão SaaS expirou. Entre novamente para continuar.");
  }
  return new SupabaseClientesRepository(sessionFromSaasSession(session));
}

export const repositorioClientesInterno = tauriClientesRepository;
