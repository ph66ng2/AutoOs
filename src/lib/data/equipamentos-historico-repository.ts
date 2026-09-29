import {
  OnlineDataError,
  sessionFromSaasSession,
  type SupabaseOnlineSession,
} from "@/lib/data/clientes-repository";
import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import type { EquipamentoHistoricoEvento, EquipamentoId } from "@/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HISTORY_EVENT_TYPES = [
  "EQUIPMENT_STATUS_UPDATED",
  "EQUIPMENT_STATUS_CORRECTED",
  "BUDGET_APPROVED",
  "SAAS_SENSITIVE_MUTATION",
] as const;
type FetchLike = typeof fetch;

interface EquipmentHistoryRow {
  id: string;
  empresa_id: string;
  criado_em: string | null;
  data_entrada: string | null;
  data_aprovacao: string | null;
  data_reprovacao: string | null;
  data_pronto: string | null;
  data_saida: string | null;
}

interface VerificationHistoryRow {
  id: string;
  empresa_id: string;
  equipamento_id: string;
  data_inicio: string | null;
  data_fim: string | null;
}

interface AuditHistoryRow {
  id: string;
  empresa_id: string;
  event_type: string;
  profile_id: string | null;
  profile_name: string | null;
  details: string | null;
  success: boolean | null;
  created_at: string | null;
  occurred_at: string;
}

interface ParsedAuditEvent {
  event: EquipamentoHistoricoEvento;
  eventType: string;
  profileId: string | null;
}

export interface EquipamentoHistoricoRepository {
  listar(equipamentoId: EquipamentoId): Promise<EquipamentoHistoricoEvento[]>;
}

function requireUuid(value: EquipamentoId): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new OnlineDataError("INVALID_DATA", "O identificador Online do equipamento é inválido.");
  }
  return value;
}

function httpError(status: number): OnlineDataError {
  if (status === 401) return new OnlineDataError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
  if (status === 403) return new OnlineDataError("RLS_DENIED", "Seu acesso ao histórico deste equipamento foi negado.");
  if (status === 400 || status === 409 || status === 422) {
    return new OnlineDataError("INVALID_DATA", "O equipamento informado não é válido para consultar o histórico.");
  }
  return new OnlineDataError("ONLINE_UNAVAILABLE", "Não foi possível carregar o histórico Online. Tente novamente.");
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function utcTimestamp(value: string | null | undefined): string | undefined {
  const candidate = textValue(value);
  if (!candidate) return undefined;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(candidate)) return candidate;
  return `${candidate.replace(" ", "T")}Z`;
}

function parseLegacyTimestamp(value: string | undefined): number | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(value)) return undefined;
  const timestamp = Date.parse(utcTimestamp(value) ?? value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function sanitizeLegacyEventDate(
  candidateValue: string | null | undefined,
  receivedAt: string | undefined,
): { data: string; dataConfiavel: boolean } | undefined {
  const candidate = textValue(candidateValue);
  if (!candidate) return undefined;

  const receivedTimestamp = parseLegacyTimestamp(receivedAt);
  const candidateTimestamp = parseLegacyTimestamp(candidate);
  if (
    receivedAt && receivedTimestamp !== undefined && candidateTimestamp !== undefined &&
    candidateTimestamp < receivedTimestamp
  ) {
    return { data: receivedAt, dataConfiavel: false };
  }
  return { data: candidate, dataConfiavel: true };
}

function parseAuditDetails(details: string | null): Record<string, unknown> {
  if (!details?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(details);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Registros locais legados usam pares chave=valor separados por ponto e vírgula.
  }
  return Object.fromEntries(details.split(";").flatMap((part) => {
    const [key, ...value] = part.trim().split("=");
    const normalizedKey = key?.trim();
    const normalizedValue = value.join("=").trim();
    return normalizedKey && normalizedValue ? [[normalizedKey, normalizedValue]] : [];
  }));
}

function detailText(details: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = textValue(details[key]);
    if (value) return value;
  }
  return undefined;
}

function parseAuditRow(row: AuditHistoryRow, equipmentId: string): ParsedAuditEvent | undefined {
  const details = parseAuditDetails(row.details);
  const eventType = row.event_type;
  const isSaasSensitiveMutation = eventType === "SAAS_SENSITIVE_MUTATION";

  if (isSaasSensitiveMutation) {
    if (details.table !== "equipamentos" || details.operation !== "UPDATE" || details.record_id !== equipmentId) {
      return undefined;
    }
  } else {
    const relatedEquipmentId = detailText(details, "equipment_id", "equipamento_id");
    if (relatedEquipmentId !== equipmentId) return undefined;
  }

  const previousStatus = detailText(details, "old_status", "status_anterior");
  const nextStatus = detailText(details, "new_status", "status");
  const approvedBudget = eventType === "BUDGET_APPROVED";
  const status = nextStatus ?? (approvedBudget ? "APROVADO" : undefined);
  if (!status || (isSaasSensitiveMutation && previousStatus === status)) return undefined;

  const timestamp = utcTimestamp(row.occurred_at) ?? utcTimestamp(row.created_at);
  if (!timestamp) return undefined;

  const corrected = eventType === "EQUIPMENT_STATUS_CORRECTED";
  const reason = detailText(details, "reason", "motivo") ?? (
    approvedBudget
      ? "Orçamento aprovado pelo cliente."
      : corrected
        ? "Correção de status do equipamento."
        : "Transição do fluxo operacional."
  );

  return {
    eventType,
    profileId: row.profile_id,
    event: {
      tipo: corrected ? "CORRECAO_STATUS" : "MUDANCA_STATUS",
      data: timestamp,
      data_confiavel: true,
      status_anterior: previousStatus ?? (approvedBudget ? "AGUARDANDO_APROVACAO" : undefined),
      status,
      motivo: reason,
      autor: textValue(row.profile_name),
    },
  };
}

function deduplicateCorrectionEvents(parsedEvents: ParsedAuditEvent[]): EquipamentoHistoricoEvento[] {
  const corrections = parsedEvents
    .filter(({ eventType }) => eventType === "EQUIPMENT_STATUS_CORRECTED")
    .map(({ event, profileId }) => ({
      previousStatus: event.status_anterior,
      status: event.status,
      profileId,
      timestamp: Date.parse(event.data),
    }));

  return parsedEvents
    .filter((candidate) => {
      if (candidate.eventType !== "SAAS_SENSITIVE_MUTATION") return true;
      const timestamp = Date.parse(candidate.event.data);
      return !corrections.some((correction) =>
        correction.previousStatus === candidate.event.status_anterior &&
        correction.status === candidate.event.status &&
        correction.profileId === candidate.profileId &&
        Number.isFinite(timestamp) && Number.isFinite(correction.timestamp) &&
        Math.abs(timestamp - correction.timestamp) <= 30_000,
      );
    })
    .map(({ event }) => event);
}

function latestVerification(rows: VerificationHistoryRow[], session: SupabaseOnlineSession, equipmentId: string) {
  for (const row of rows) {
    if (
      row.empresa_id !== session.companyId || row.equipamento_id !== equipmentId ||
      !UUID_PATTERN.test(row.id)
    ) {
      throw new OnlineDataError("RLS_DENIED", "A resposta Online contém uma verificação fora do equipamento ou da empresa autenticada.");
    }
  }
  return [...rows].sort((left, right) => {
    const leftDate = Date.parse(utcTimestamp(left.data_fim ?? left.data_inicio) ?? "") || 0;
    const rightDate = Date.parse(utcTimestamp(right.data_fim ?? right.data_inicio) ?? "") || 0;
    return rightDate - leftDate || right.id.localeCompare(left.id);
  })[0];
}

function buildHistory(
  equipment: EquipmentHistoryRow,
  verification: VerificationHistoryRow | undefined,
  auditRows: AuditHistoryRow[],
  session: SupabaseOnlineSession,
): EquipamentoHistoricoEvento[] {
  if (equipment.empresa_id !== session.companyId || !UUID_PATTERN.test(equipment.id)) {
    throw new OnlineDataError("RLS_DENIED", "A resposta Online contém um equipamento fora da empresa autenticada.");
  }
  for (const row of auditRows) {
    if (
      row.empresa_id !== session.companyId || !UUID_PATTERN.test(row.id) ||
      !HISTORY_EVENT_TYPES.includes(row.event_type as (typeof HISTORY_EVENT_TYPES)[number])
    ) {
      throw new OnlineDataError("RLS_DENIED", "A resposta Online contém eventos fora da empresa autenticada.");
    }
  }

  const auditEvents = deduplicateCorrectionEvents(
    auditRows
      .filter((row) => row.success !== false)
      .map((row) => parseAuditRow(row, equipment.id))
      .filter((row): row is ParsedAuditEvent => row !== undefined),
  );
  const auditedStatuses = new Set(auditEvents.map(({ status }) => status));
  const receivedAt = utcTimestamp(equipment.criado_em) ?? textValue(equipment.data_entrada);
  const events: EquipamentoHistoricoEvento[] = [...auditEvents];

  const addLegacyStage = (status: string, date: string | null | undefined, reason: string) => {
    if (auditedStatuses.has(status)) return;
    const sanitized = sanitizeLegacyEventDate(date, receivedAt);
    if (!sanitized) return;
    events.push({
      tipo: "ETAPA",
      data: sanitized.data,
      data_confiavel: sanitized.dataConfiavel,
      status,
      motivo: reason,
    });
  };

  addLegacyStage("RECEBIDO", receivedAt, "Equipamento recebido e cadastrado.");
  addLegacyStage("VERIFICADO", utcTimestamp(verification?.data_fim), "Verificação técnica registrada.");
  addLegacyStage("EM_VERIFICACAO", utcTimestamp(verification?.data_inicio), "Verificação técnica iniciada.");
  addLegacyStage("APROVADO", equipment.data_aprovacao, "Orçamento aprovado pelo cliente.");
  addLegacyStage("REPROVADO", equipment.data_reprovacao, "Orçamento reprovado pelo cliente.");
  addLegacyStage("PRONTO", equipment.data_pronto, "Serviço concluído; equipamento pronto.");
  addLegacyStage("ENTREGUE", equipment.data_saida, "Equipamento entregue ao cliente.");

  return events.sort((left, right) => left.data.localeCompare(right.data));
}

export class SupabaseEquipamentoHistoricoRepository implements EquipamentoHistoricoRepository {
  constructor(
    private readonly session: SupabaseOnlineSession,
    private readonly fetcher: FetchLike = fetch.bind(globalThis),
  ) {}

  private endpoint(table: "equipamentos" | "verificacoes" | "security_audit_log", query: URLSearchParams): string {
    return `${this.session.supabaseUrl}/rest/v1/${table}?${query.toString()}`;
  }

  private async request<T>(url: string): Promise<T[]> {
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: {
          apikey: this.session.publishableKey,
          Authorization: `Bearer ${this.session.accessToken}`,
        },
      });
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "A comunicação com o serviço Online falhou. Tente novamente.");
    }
    if (!response.ok) throw httpError(response.status);
    try {
      return await response.json() as T[];
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou um histórico inválido.");
    }
  }

  async listar(equipamentoId: EquipamentoId): Promise<EquipamentoHistoricoEvento[]> {
    const id = requireUuid(equipamentoId);
    const equipmentQuery = new URLSearchParams({
      select: "id,empresa_id,criado_em,data_entrada,data_aprovacao,data_reprovacao,data_pronto,data_saida",
      id: `eq.${id}`,
      empresa_id: `eq.${this.session.companyId}`,
      limit: "1",
    });
    const equipmentRows = await this.request<EquipmentHistoryRow>(this.endpoint("equipamentos", equipmentQuery));
    const equipment = equipmentRows[0];
    if (!equipment) {
      throw new OnlineDataError("RLS_DENIED", "O equipamento não pertence à empresa autenticada ou não está disponível.");
    }
    if (
      equipment.id !== id || equipment.empresa_id !== this.session.companyId ||
      !UUID_PATTERN.test(equipment.id)
    ) {
      throw new OnlineDataError("RLS_DENIED", "A resposta Online contém um equipamento fora da empresa autenticada.");
    }

    const verificationQuery = new URLSearchParams({
      select: "id,empresa_id,equipamento_id,data_inicio,data_fim",
      empresa_id: `eq.${this.session.companyId}`,
      equipamento_id: `eq.${id}`,
      order: "data_inicio.desc,id.desc",
      limit: "1000",
    });
    const auditQuery = new URLSearchParams({
      select: "id,empresa_id,event_type,profile_id,profile_name,details,created_at,occurred_at,success",
      empresa_id: `eq.${this.session.companyId}`,
      success: "eq.true",
      event_type: `in.(${HISTORY_EVENT_TYPES.join(",")})`,
      details: `ilike.*${id}*`,
      order: "occurred_at.asc,id.asc",
      limit: "1000",
    });
    const [verificationRows, auditRows] = await Promise.all([
      this.request<VerificationHistoryRow>(this.endpoint("verificacoes", verificationQuery)),
      this.request<AuditHistoryRow>(this.endpoint("security_audit_log", auditQuery)),
    ]);
    const verification = latestVerification(verificationRows, this.session, id);
    return buildHistory(equipment, verification, auditRows, this.session);
  }
}

export async function carregarRepositorioHistoricoEquipamento(): Promise<EquipamentoHistoricoRepository> {
  const session = await tauriSaasSessionStore.load();
  if (!session) {
    throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão SaaS expirou. Entre novamente para continuar.");
  }
  return new SupabaseEquipamentoHistoricoRepository(sessionFromSaasSession(session));
}
