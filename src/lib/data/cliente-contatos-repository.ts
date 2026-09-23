import { db } from "@/lib/db";
import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import { OnlineDataError, sessionFromSaasSession, type SupabaseOnlineSession } from "@/lib/data/clientes-repository";
import type { ClienteContato, ClienteContatoInput, ClienteId } from "@/types";

export interface ClienteContatosRepository {
  listar(clienteId: ClienteId, empresaId?: number): Promise<ClienteContato[]>;
  criar(input: ClienteContatoInput): Promise<ClienteContato>;
  atualizar(id: ClienteId, input: ClienteContatoInput): Promise<ClienteContato>;
  inativar(id: ClienteId, empresaId?: number): Promise<ClienteContato>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuid(value: ClienteId | undefined): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new OnlineDataError("INVALID_SESSION", "O contato ou cliente não possui identificador Online válido.");
  }
  return value;
}

function numeric(value: ClienteId | undefined, label: string): number {
  if (typeof value !== "number") throw new Error(`${label} local inválido.`);
  return value;
}

export class SupabaseClienteContatosRepository implements ClienteContatosRepository {
  constructor(private readonly session: SupabaseOnlineSession, private readonly fetcher: typeof fetch = fetch.bind(globalThis)) {}

  private endpoint(query: string): string {
    return `${this.session.supabaseUrl}/rest/v1/cliente_contatos${query}`;
  }

  private async request(url: string, init: RequestInit): Promise<ClienteContato[]> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        ...init,
        headers: {
          apikey: this.session.publishableKey,
          Authorization: `Bearer ${this.session.accessToken}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "A comunicação com o serviço Online falhou. Seus dados foram mantidos; tente novamente.");
    }
    if (response.status === 401) throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
    if (response.status === 403) throw new OnlineDataError("RLS_DENIED", "Seu acesso aos contatos foi negado pela empresa.");
    if (!response.ok) throw new OnlineDataError("ONLINE_UNAVAILABLE", "Não foi possível concluir a operação de contatos Online. Tente novamente.");
    return response.json() as Promise<ClienteContato[]>;
  }

  async listar(clienteId: ClienteId): Promise<ClienteContato[]> {
    const id = uuid(clienteId);
    return this.request(this.endpoint(`?select=*&empresa_id=eq.${this.session.companyId}&cliente_id=eq.${id}&ativo=is.true&order=nome.asc`), { method: "GET" });
  }

  async criar(input: ClienteContatoInput): Promise<ClienteContato> {
    const rows = await this.request(this.endpoint(""), {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        empresa_id: this.session.companyId,
        cliente_id: uuid(input.cliente_id),
        nome: input.nome.trim(),
        email: input.email || null,
        telefone: input.telefone || null,
        ativo: true,
      }),
    });
    if (!rows[0]) throw new OnlineDataError("RLS_DENIED", "O contato não pôde ser criado para sua empresa.");
    return rows[0];
  }

  async atualizar(id: ClienteId, input: ClienteContatoInput): Promise<ClienteContato> {
    const contactId = uuid(id);
    const clientId = uuid(input.cliente_id);
    const token = input.atualizado_em ? `&atualizado_em=eq.${encodeURIComponent(input.atualizado_em)}` : "";
    const rows = await this.request(this.endpoint(`?id=eq.${contactId}&empresa_id=eq.${this.session.companyId}&cliente_id=eq.${clientId}${token}`), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        nome: input.nome.trim(),
        email: input.email || null,
        telefone: input.telefone || null,
        atualizado_em: new Date().toISOString(),
      }),
    });
    if (!rows[0]) throw new OnlineDataError("RLS_DENIED", "O contato mudou ou não está disponível para sua empresa. Recarregue e tente novamente.");
    return rows[0];
  }

  async inativar(id: ClienteId): Promise<ClienteContato> {
    const rows = await this.request(this.endpoint(`?id=eq.${uuid(id)}&empresa_id=eq.${this.session.companyId}&ativo=is.true`), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ativo: false, atualizado_em: new Date().toISOString() }),
    });
    if (!rows[0]) throw new OnlineDataError("RLS_DENIED", "O contato não pôde ser inativado para sua empresa.");
    return rows[0];
  }
}

const tauriRepository: ClienteContatosRepository = {
  listar: (clienteId, empresaId) => db.listarClienteContatos(numeric(clienteId, "Cliente"), numeric(empresaId, "Empresa")),
  criar: (input) => db.criarClienteContato(input),
  atualizar: (id, input) => db.atualizarClienteContato(numeric(id, "Contato"), input),
  inativar: (id, empresaId) => db.inativarClienteContato(numeric(id, "Contato"), numeric(empresaId, "Empresa")),
};

export async function carregarRepositorioClienteContatos(): Promise<ClienteContatosRepository> {
  if (!IS_SAAS_BUILD) return tauriRepository;
  const session = await tauriSaasSessionStore.load();
  if (!session) throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão SaaS expirou. Entre novamente para continuar.");
  return new SupabaseClienteContatosRepository(sessionFromSaasSession(session));
}
