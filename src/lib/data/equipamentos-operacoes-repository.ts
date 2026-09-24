import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import {
  OnlineDataError,
  sessionFromSaasSession,
  type SupabaseOnlineSession,
} from "@/lib/data/clientes-repository";
import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import type {
  Equipamento,
  FormaPagamento,
  ServicoCatalogo,
  ServicoNecessario,
  PecaNecessaria,
  Verificacao,
} from "@/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type FetchLike = typeof fetch;

export interface EquipmentOperationResult {
  equipment: Equipamento<string>;
  verification?: Verificacao;
}

export interface EquipmentQuoteInput {
  equipmentId: string;
  expectedUpdatedAt: string;
  services: ServicoNecessario[];
  parts: PecaNecessaria[];
  total: number;
  observations?: string;
  newStatus?: string;
  approvalDeadline?: string;
  payment?: FormaPagamento;
  correctionReason?: string;
}

export interface EquipmentStatusInput {
  equipmentId: string;
  expectedUpdatedAt: string;
  status: string;
  budget?: number;
  approvalDeadline?: string;
  finalValue?: number;
  correctionReason?: string;
}

export interface EquipmentOperationsRepository {
  getVerification(equipmentId: string): Promise<Verificacao | null>;
  listActiveServices(): Promise<ServicoCatalogo<string>[]>;
  finalizeVerification(input: {
    equipmentId: string;
    expectedUpdatedAt: string;
    verification: Omit<Verificacao, "id" | "empresa_id">;
    approvalDeadline: string;
  }): Promise<EquipmentOperationResult>;
  saveQuote(input: EquipmentQuoteInput): Promise<EquipmentOperationResult>;
  changeStatus(input: EquipmentStatusInput): Promise<Equipamento<string>>;
  approveQuote(input: {
    equipmentId: string;
    expectedUpdatedAt: string;
    payment: FormaPagamento;
  }): Promise<Equipamento<string>>;
}

function validUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

function assertOperationInput(id: string, expectedUpdatedAt: string): void {
  if (!validUuid(id)) {
    throw new OnlineDataError("INVALID_DATA", "O identificador do equipamento Online é inválido.");
  }
  if (!expectedUpdatedAt.trim()) {
    throw new OnlineDataError("INVALID_DATA", "A versão atual não está disponível. Atualize os dados e tente novamente.");
  }
}

function parseArrayField(value: string | undefined, label: string): unknown[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("not-array");
    return parsed;
  } catch {
    throw new OnlineDataError("INVALID_DATA", `O campo ${label} possui dados inválidos. Revise o formulário antes de salvar.`);
  }
}

function operationHttpError(status: number, code?: string): OnlineDataError {
  if (status === 401) return new OnlineDataError("SESSION_EXPIRED", "Sua sessão expirou. Entre novamente para continuar.");
  if (status === 403 || code === "42501") return new OnlineDataError("RLS_DENIED", "Seu perfil não tem autorização para esta operação, ou o registro não pertence à sua empresa.");
  if (code === "40001") return new OnlineDataError("CONFLICT", "O equipamento foi alterado por outra pessoa. Atualize a lista e tente novamente.");
  if (code === "22023" || code === "22P02" || code?.startsWith("23")) {
    return new OnlineDataError("INVALID_DATA", "A operação tem um status ou dados inválidos. Revise os campos e tente novamente.");
  }
  if (code === "P0002") return new OnlineDataError("INVALID_DATA", "Não foi encontrada uma verificação técnica salva para este equipamento.");
  return new OnlineDataError("ONLINE_UNAVAILABLE", "Não foi possível concluir a operação online. Seus dados foram mantidos; tente novamente.");
}

function assertTenant<T extends { empresa_id?: string | number }>(row: T, session: SupabaseOnlineSession): T {
  if (String(row.empresa_id ?? "") !== session.companyId) {
    throw new OnlineDataError("RLS_DENIED", "A resposta Online contém dados fora da empresa autenticada.");
  }
  return row;
}

function operationResult(value: unknown, session: SupabaseOnlineSession): EquipmentOperationResult {
  const candidate = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma resposta inválida. Tente novamente.");
  }
  const result = candidate as { equipment?: Equipamento<string>; verification?: Verificacao };
  if (!result.equipment || typeof result.equipment.id !== "string" || !validUuid(result.equipment.id)) {
    throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou um equipamento inválido.");
  }
  assertTenant(result.equipment, session);
  if (result.verification) assertTenant(result.verification, session);
  return result as EquipmentOperationResult;
}

export function calcularPrazoAprovacaoOnline(diasUteis = 5, now = new Date()): string {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let added = 0;
  while (added < diasUteis) {
    date.setDate(date.getDate() + 1);
    if (date.getDay() !== 0 && date.getDay() !== 6) added++;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class SupabaseEquipmentOperationsRepository implements EquipmentOperationsRepository {
  constructor(private readonly session: SupabaseOnlineSession, private readonly fetcher: FetchLike = fetch.bind(globalThis)) {}

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
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
    if (!response.ok) {
      let body: { code?: string; message?: string } = {};
      try { body = await response.json() as typeof body; } catch { /* resposta sem JSON */ }
      throw operationHttpError(response.status, body.code);
    }
    try {
      return await response.json() as T;
    } catch {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma resposta inválida. Tente novamente.");
    }
  }

  private rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>(`${this.session.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getVerification(equipmentId: string): Promise<Verificacao | null> {
    if (!validUuid(equipmentId)) throw new OnlineDataError("INVALID_DATA", "O identificador do equipamento Online é inválido.");
    const query = new URLSearchParams({
      select: "*",
      equipamento_id: `eq.${equipmentId}`,
      empresa_id: `eq.${this.session.companyId}`,
      order: "data_inicio.desc.nullslast,id.desc",
      limit: "1",
    });
    const rows = await this.request<Verificacao[]>(`${this.session.supabaseUrl}/rest/v1/verificacoes?${query}`);
    const verification = rows[0];
    return verification ? assertTenant(verification, this.session) : null;
  }

  async listActiveServices(): Promise<ServicoCatalogo<string>[]> {
    const query = new URLSearchParams({
      select: "id,empresa_id,nome,descricao,preco_padrao,ativo,criado_em,atualizado_em",
      empresa_id: `eq.${this.session.companyId}`,
      ativo: "eq.true",
      order: "nome.asc",
    });
    const rows = await this.request<ServicoCatalogo<string>[]>(`${this.session.supabaseUrl}/rest/v1/servicos_catalogo?${query}`);
    return rows.map((row) => assertTenant(row, this.session));
  }

  async finalizeVerification(input: {
    equipmentId: string;
    expectedUpdatedAt: string;
    verification: Omit<Verificacao, "id" | "empresa_id">;
    approvalDeadline: string;
  }): Promise<EquipmentOperationResult> {
    assertOperationInput(input.equipmentId, input.expectedUpdatedAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.approvalDeadline)) {
      throw new OnlineDataError("INVALID_DATA", "O prazo de aprovação informado é inválido.");
    }
    const verification = input.verification;
    const result = await this.rpc<unknown>("saas_finalize_equipment_verification", {
      p_equipment_id: input.equipmentId,
      p_expected_updated_em: input.expectedUpdatedAt,
      p_approval_deadline: input.approvalDeadline,
      p_verification: {
        tecnico_nome: verification.tecnico_nome,
        problema_relatado: verification.problema_relatado,
        diagnostico: verification.diagnostico ?? "",
        itens_verificados: parseArrayField(verification.itens_verificados, "itens verificados"),
        servicos_necessarios: parseArrayField(verification.servicos_necessarios, "serviços"),
        pecas_necessarias: parseArrayField(verification.pecas_necessarias, "peças"),
        custo_estimado_mao_obra: verification.custo_estimado_mao_obra ?? 0,
        custo_estimado_pecas: verification.custo_estimado_pecas ?? 0,
        custo_total: verification.custo_total ?? 0,
        tempo_estimado: verification.tempo_estimado ?? 0,
        observacoes: verification.observacoes ?? "",
      },
    });
    return operationResult(result, this.session);
  }

  async saveQuote(input: EquipmentQuoteInput): Promise<EquipmentOperationResult> {
    assertOperationInput(input.equipmentId, input.expectedUpdatedAt);
    if (!Number.isFinite(input.total) || input.total < 0) {
      throw new OnlineDataError("INVALID_DATA", "O valor total do orçamento precisa ser maior ou igual a zero.");
    }
    const result = await this.rpc<unknown>("saas_update_equipment_quote", {
      p_equipment_id: input.equipmentId,
      p_expected_updated_em: input.expectedUpdatedAt,
      p_services: input.services,
      p_parts: input.parts,
      p_total: input.total,
      p_observations: input.observations ?? null,
      p_new_status: input.newStatus ?? null,
      p_approval_deadline: input.approvalDeadline || null,
      p_payment_code: input.payment?.codigo ?? null,
      p_payment_detail: input.payment?.detalhe ?? null,
      p_correction_reason: input.correctionReason ?? null,
    });
    return operationResult(result, this.session);
  }

  async changeStatus(input: EquipmentStatusInput): Promise<Equipamento<string>> {
    assertOperationInput(input.equipmentId, input.expectedUpdatedAt);
    const response = await this.rpc<unknown>("saas_update_equipment_status", {
      p_equipment_id: input.equipmentId,
      p_expected_updated_em: input.expectedUpdatedAt,
      p_new_status: input.status,
      p_budget: input.budget ?? null,
      p_approval_deadline: input.approvalDeadline || null,
      p_final_value: input.finalValue ?? null,
      p_correction_reason: input.correctionReason ?? null,
    });
    const equipment = Array.isArray(response) && response.length === 1 ? response[0] as Equipamento<string> : response as Equipamento<string>;
    if (!equipment || typeof equipment.id !== "string" || !validUuid(equipment.id)) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou um equipamento inválido.");
    }
    return assertTenant(equipment, this.session);
  }

  async approveQuote(input: { equipmentId: string; expectedUpdatedAt: string; payment: FormaPagamento }): Promise<Equipamento<string>> {
    assertOperationInput(input.equipmentId, input.expectedUpdatedAt);
    const response = await this.rpc<unknown>("saas_approve_equipment_quote", {
      p_equipment_id: input.equipmentId,
      p_expected_updated_em: input.expectedUpdatedAt,
      p_payment_code: input.payment.codigo,
      p_payment_detail: input.payment.detalhe ?? null,
    });
    const equipment = Array.isArray(response) && response.length === 1 ? response[0] as Equipamento<string> : response as Equipamento<string>;
    if (!equipment || typeof equipment.id !== "string" || !validUuid(equipment.id)) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou um equipamento inválido.");
    }
    return assertTenant(equipment, this.session);
  }
}

export async function carregarRepositorioOperacoesEquipamento(): Promise<EquipmentOperationsRepository> {
  if (!IS_SAAS_BUILD) {
    throw new Error("O repositório de operações SaaS só pode ser carregado no build SaaS.");
  }
  const session = await tauriSaasSessionStore.load();
  if (!session) throw new OnlineDataError("SESSION_EXPIRED", "Sua sessão SaaS expirou. Entre novamente para continuar.");
  return new SupabaseEquipmentOperationsRepository(sessionFromSaasSession(session));
}
