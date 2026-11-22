import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import { db } from "@/lib/db";
import {
  OnlineDataError,
  sessionFromSaasSession,
  type SupabaseOnlineSession,
} from "@/lib/data/clientes-repository";
import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import type { Comunicacao, EquipamentoId } from "@/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type CommunicationDraft = Omit<Comunicacao<EquipamentoId>, "id" | "criado_em">;
type FetchLike = typeof fetch;

export interface ComunicacoesRepository {
  listar(equipamentoId: EquipamentoId): Promise<Comunicacao<EquipamentoId>[]>;
  registrar(comunicacao: CommunicationDraft): Promise<Comunicacao<EquipamentoId>>;
}

function requireUuid(value: EquipamentoId, label: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new OnlineDataError("INVALID_DATA", `O identificador Online de ${label} é inválido.`);
  }
  return value;
}

function assertTenantCommunication(
  row: Comunicacao<string>,
  session: SupabaseOnlineSession,
  equipmentId: string,
): Comunicacao<string> {
  if (
    typeof row.id !== "string" || !UUID_PATTERN.test(row.id) ||
    row.empresa_id !== session.companyId ||
    row.equipamento_id !== equipmentId
  ) {
    throw new OnlineDataError("RLS_DENIED", "A resposta Online contém uma comunicação fora do equipamento ou da empresa autenticada.");
  }
  return row;
}

function httpError(status: number): OnlineDataError {
  if (status === 401) return new OnlineDataError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
  if (status === 403) return new OnlineDataError("RLS_DENIED", "Seu acesso às comunicações foi negado pela empresa.");
  if (status === 400 || status === 409 || status === 422) return new OnlineDataError("INVALID_DATA", "Os dados da comunicação ou o equipamento não são válidos para sua empresa.");
  return new OnlineDataError("ONLINE_UNAVAILABLE", "Não foi possível carregar ou registrar as comunicações Online. Tente novamente.");
}

export class SupabaseComunicacoesRepository implements ComunicacoesRepository {
  constructor(private readonly session: SupabaseOnlineSession, private readonly fetcher: FetchLike = fetch.bind(globalThis)) {}

  private endpoint(table: "comunicacoes" | "equipamentos", query: URLSearchParams): string {
    return `${this.session.supabaseUrl}/rest/v1/${table}?${query.toString()}`;
  }

  private async request<T>(url: string, init: RequestInit): Promise<T[]> {
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
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "A comunicação com o serviço Online falhou. Tente novamente.");
    }
    if (!response.ok) throw httpError(response.status);
    if (response.status === 204) return [];
    try {
      return await response.json() as T[];
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma resposta inválida. Tente novamente.");
    }
  }

  async listar(equipamentoId: EquipamentoId): Promise<Comunicacao<string>[]> {
    const id = requireUuid(equipamentoId, "equipamento");
    const query = new URLSearchParams({
      select: "*",
      empresa_id: `eq.${this.session.companyId}`,
      equipamento_id: `eq.${id}`,
      order: "criado_em.desc",
    });
    const rows = await this.request<Comunicacao<string>>(this.endpoint("comunicacoes", query), { method: "GET" });
    return rows.map((row) => assertTenantCommunication(row, this.session, id));
  }

  async registrar(comunicacao: CommunicationDraft): Promise<Comunicacao<string>> {
    const equipmentId = requireUuid(comunicacao.equipamento_id, "equipamento");
    const tipo = comunicacao.tipo.trim();
    const canal = comunicacao.canal.trim().toUpperCase();
    const destinatario = comunicacao.destinatario.trim();
    const contato = comunicacao.contato.trim();
    const mensagem = comunicacao.mensagem.trim();
    if (!tipo || !["EMAIL", "WHATSAPP"].includes(canal) || !destinatario || !contato || !mensagem) {
      throw new OnlineDataError("INVALID_DATA", "Informe o tipo, canal, destinatário, contato e mensagem da comunicação.");
    }

    // RLS hides other tenants' equipment; the explicit lookup prevents a caller
    // from attaching an otherwise-valid log to a UUID from another company.
    const equipmentQuery = new URLSearchParams({
      select: "id,empresa_id",
      id: `eq.${equipmentId}`,
      empresa_id: `eq.${this.session.companyId}`,
      limit: "1",
    });
    const equipment = await this.request<{ id: string; empresa_id: string }>(
      this.endpoint("equipamentos", equipmentQuery),
      { method: "GET" },
    );
    if (equipment.length !== 1 || equipment[0]?.id !== equipmentId || equipment[0]?.empresa_id !== this.session.companyId) {
      throw new OnlineDataError("RLS_DENIED", "O equipamento não pertence à empresa autenticada ou não está disponível.");
    }

    const query = new URLSearchParams({ select: "*" });
    const enviado = comunicacao.enviado === true;
    const payload = {
      empresa_id: this.session.companyId,
      equipamento_id: equipmentId,
      tipo,
      canal,
      destinatario,
      contato,
      assunto: comunicacao.assunto?.trim() || null,
      mensagem,
      anexos: comunicacao.anexos ?? null,
      enviado,
      data_envio: enviado ? comunicacao.data_envio ?? new Date().toISOString() : null,
      erro: comunicacao.erro?.trim() || null,
    };
    const rows = await this.request<Comunicacao<string>>(this.endpoint("comunicacoes", query), {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    const row = rows[0];
    if (!row) throw new OnlineDataError("RLS_DENIED", "O registro da comunicação foi recusado pela empresa.");
    return assertTenantCommunication(row, this.session, equipmentId);
  }
}

const tauriComunicacoesRepository: ComunicacoesRepository = {
  listar: async (equipamentoId) => {
    if (typeof equipamentoId !== "number") throw new OnlineDataError("INVALID_DATA", "O identificador local do equipamento é inválido.");
    return db.listarComunicacoes(equipamentoId);
  },
  registrar: (comunicacao) => db.registrarComunicacao(comunicacao as Omit<Comunicacao, "id">),
};

export async function carregarRepositorioComunicacoes(): Promise<ComunicacoesRepository> {
  if (!IS_SAAS_BUILD) return tauriComunicacoesRepository;
  const session = await tauriSaasSessionStore.load();
  if (!session) throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão SaaS expirou. Entre novamente para continuar.");
  return new SupabaseComunicacoesRepository(sessionFromSaasSession(session));
}
