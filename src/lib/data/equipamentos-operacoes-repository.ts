import { IS_SAAS_BUILD } from "@/lib/runtime-mode";
import {
  OnlineDataError,
  sessionFromSaasSession,
  type SupabaseOnlineSession,
} from "@/lib/data/clientes-repository";
import { tauriSaasSessionStore } from "@/lib/saas-session-store";
import { validatePecasSugeridas } from "@/lib/data/servicos-repository";
import type {
  AnaliseAjusteOrcamento,
  AnaliseCorrecaoDecisao,
  Equipamento,
  FormaPagamento,
  ModoCorrecaoDecisao,
  OpcoesAjusteOrcamento,
  PortalAjusteInfo,
  ServicoCatalogo,
  ServicoNecessario,
  PecaNecessaria,
  Verificacao,
} from "@/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICE_PAGE_SIZE = 100;
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
  adjustment?: OpcoesAjusteOrcamento;
}

export interface EquipmentPartConsumption {
  verificacao_id: string;
  servico_id: string;
  produto_id: string;
  nome: string;
  quantidade_aprovada: number;
  quantidade_baixada: number;
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

export function quoteInputForAdjustment(
  input: EquipmentQuoteInput,
  adjustment?: OpcoesAjusteOrcamento,
): EquipmentQuoteInput {
  if (adjustment?.modoAprovado !== "NOVA_APROVACAO") {
    return { ...input, adjustment };
  }
  return {
    ...input,
    adjustment,
    newStatus: "AGUARDANDO_APROVACAO",
    payment: undefined,
    correctionReason:
      input.correctionReason?.trim()
      || "Orçamento alterado depois da aprovação: nova aprovação pedida ao cliente.",
  };
}

function parseAnaliseAjuste(value: unknown): AnaliseAjusteOrcamento {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma análise de orçamento inválida.");
  }
  const row = value as Record<string, unknown>;
  const pecasRaw = Array.isArray(row.pecasBaixadas) ? row.pecasBaixadas : [];
  const pecasBaixadas = pecasRaw.map((peca) => {
    if (!peca || typeof peca !== "object") {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou peças baixadas inválidas.");
    }
    const item = peca as Record<string, unknown>;
    const quantidade = Number(item.quantidade);
    if ((typeof item.produtoId !== "string" && typeof item.produtoId !== "number")
      || typeof item.nome !== "string"
      || !Number.isFinite(quantidade) || quantidade <= 0) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou peças baixadas inválidas.");
    }
    return { produtoId: item.produtoId, nome: item.nome, quantidade };
  });
  const totalBaixado = Number(row.totalBaixado);
  return {
    status: String(row.status ?? ""),
    podePedirNovaAprovacao: row.podePedirNovaAprovacao === true,
    jaPublicado: row.jaPublicado === true,
    versaoAberta: typeof row.versaoAberta === "number" ? row.versaoAberta : null,
    respostaPendente: row.respostaPendente && typeof row.respostaPendente === "object"
      ? row.respostaPendente as AnaliseAjusteOrcamento["respostaPendente"]
      : null,
    pecasBaixadas,
    totalBaixado: Number.isFinite(totalBaixado) ? totalBaixado : 0,
    exigeDecisaoEstoque: row.exigeDecisaoEstoque === true,
  };
}

function parsePecasBaixadas(value: unknown): AnaliseCorrecaoDecisao["pecasBaixadas"] {
  if (!Array.isArray(value)) return [];
  return value.map((peca) => {
    if (!peca || typeof peca !== "object") {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou peças baixadas inválidas.");
    }
    const item = peca as Record<string, unknown>;
    const quantidade = Number(item.quantidade);
    if ((typeof item.produtoId !== "string" && typeof item.produtoId !== "number")
      || typeof item.nome !== "string"
      || !Number.isFinite(quantidade) || quantidade <= 0) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou peças baixadas inválidas.");
    }
    return { produtoId: item.produtoId, nome: item.nome, quantidade };
  });
}

function parseAnaliseCorrecao(value: unknown): AnaliseCorrecaoDecisao {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma análise de correção inválida.");
  }
  const row = value as Record<string, unknown>;
  const totalBaixado = Number(row.totalBaixado);
  const bloqueios = Array.isArray(row.bloqueios)
    ? row.bloqueios.filter((item): item is string => typeof item === "string")
    : [];
  return {
    status: String(row.status ?? ""),
    podeCorrigir: row.podeCorrigir === true,
    bloqueios,
    ajustadoAposDecisao: row.ajustadoAposDecisao === true,
    permiteRestaurar: row.permiteRestaurar === true,
    permiteManter: row.permiteManter === true,
    pagamentoCodigo: typeof row.pagamentoCodigo === "string" ? row.pagamentoCodigo : null,
    pagamentoDetalhe: typeof row.pagamentoDetalhe === "string" ? row.pagamentoDetalhe : null,
    valorAtual: row.valorAtual == null ? null : Number(row.valorAtual),
    valorOriginal: row.valorOriginal == null ? null : Number(row.valorOriginal),
    pecasBaixadas: parsePecasBaixadas(row.pecasBaixadas),
    totalBaixado: Number.isFinite(totalBaixado) ? totalBaixado : 0,
    exigeDecisaoEstoque: row.exigeDecisaoEstoque === true,
  };
}

function parsePortal(value: unknown): PortalAjusteInfo | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const acao = row.acao;
  if (acao !== "NENHUMA" && acao !== "VERSAO_PUBLICADA" && acao !== "NOVA_APROVACAO_PUBLICADA"
    && acao !== "VALOR_ATUALIZADO" && acao !== "NAO_PUBLICADA") {
    return undefined;
  }
  return {
    acao,
    versao: typeof row.versao === "number" ? row.versao : null,
    mensagem: typeof row.mensagem === "string" ? row.mensagem : null,
    aviso: typeof row.aviso === "string" ? row.aviso : null,
  };
}

export interface EquipmentDecisionCorrectionInput {
  equipmentId: string;
  expectedUpdatedAt: string;
  motivo: string;
  devolverEstoque: boolean;
  modo: ModoCorrecaoDecisao;
}

export interface EquipmentOperationsRepository {
  getVerification(equipmentId: string): Promise<Verificacao | null>;
  analyzeQuoteAdjustment(equipmentId: string): Promise<AnaliseAjusteOrcamento>;
  analyzeDecisionCorrection(equipmentId: string): Promise<AnaliseCorrecaoDecisao>;
  correctQuoteDecision(input: EquipmentDecisionCorrectionInput): Promise<{
    equipment: Equipamento<string>;
    portal?: PortalAjusteInfo;
  }>;
  extendApprovalDeadline(input: {
    equipmentId: string;
    expectedUpdatedAt: string;
    newDeadline: string;
  }): Promise<{ prorrogado: boolean; equipment: Equipamento<string> }>;
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
    servicesApproved?: string[];
  }): Promise<Equipamento<string>>;
  listPartsConsumption?(equipmentId: string): Promise<EquipmentPartConsumption[]>;
  consumePendingParts?(equipmentId: string): Promise<number>;
  registerCounterIntakeVerification?(input: {
    equipmentId: string;
    technician: string;
    reportedProblem: string;
    diagnosis: string;
    observations: string;
  }): Promise<Verificacao>;
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

function operatorFacingMessage(raw?: string): string | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  if (/https?:\/\/|bearer\s|service_role|apikey|postgres:\/\//i.test(text)) return undefined;
  return text.length > 400 ? text.slice(0, 400) : text;
}

function operationHttpError(status: number, code?: string, message?: string): OnlineDataError {
  const operatorMessage = operatorFacingMessage(message);
  if (status === 401) return new OnlineDataError("SESSION_EXPIRED", operatorMessage || "Sua sessão expirou. Entre novamente para continuar.");
  if (status === 403 || code === "42501") {
    return new OnlineDataError("RLS_DENIED", operatorMessage || "Seu perfil não tem autorização para esta operação, ou o registro não pertence à sua empresa.");
  }
  if (code === "40001") return new OnlineDataError("CONFLICT", operatorMessage || "O equipamento foi alterado por outra pessoa. Atualize a lista e tente novamente.");
  if (code === "22023" || code === "22P02" || code?.startsWith("23")) {
    return new OnlineDataError("INVALID_DATA", operatorMessage || "A operação tem um status ou dados inválidos. Revise os campos e tente novamente.");
  }
  if (code === "P0002") {
    return new OnlineDataError("INVALID_DATA", operatorMessage || "Não foi encontrada uma verificação técnica salva para este equipamento.");
  }
  return new OnlineDataError(
    "ONLINE_UNAVAILABLE",
    operatorMessage || "Não foi possível concluir a operação online. Seus dados foram mantidos; tente novamente.",
  );
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
      throw operationHttpError(response.status, body.code, body.message);
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

  async analyzeQuoteAdjustment(equipmentId: string): Promise<AnaliseAjusteOrcamento> {
    if (!validUuid(equipmentId)) throw new OnlineDataError("INVALID_DATA", "O identificador do equipamento Online é inválido.");
    const result = await this.rpc<unknown>("saas_analisar_ajuste_orcamento", {
      p_equipment_id: equipmentId,
    });
    return parseAnaliseAjuste(Array.isArray(result) && result.length === 1 ? result[0] : result);
  }

  async analyzeDecisionCorrection(equipmentId: string): Promise<AnaliseCorrecaoDecisao> {
    if (!validUuid(equipmentId)) throw new OnlineDataError("INVALID_DATA", "O identificador do equipamento Online é inválido.");
    const result = await this.rpc<unknown>("saas_analisar_correcao_decisao", {
      p_equipment_id: equipmentId,
    });
    return parseAnaliseCorrecao(Array.isArray(result) && result.length === 1 ? result[0] : result);
  }

  async correctQuoteDecision(input: EquipmentDecisionCorrectionInput): Promise<{
    equipment: Equipamento<string>;
    portal?: PortalAjusteInfo;
  }> {
    assertOperationInput(input.equipmentId, input.expectedUpdatedAt);
    if (input.motivo.trim().length < 5) {
      throw new OnlineDataError("INVALID_DATA", "Informe o motivo da correção (mínimo de 5 caracteres).");
    }
    const result = await this.rpc<unknown>("saas_corrigir_decisao_orcamento", {
      p_equipment_id: input.equipmentId,
      p_expected_updated_em: input.expectedUpdatedAt,
      p_motivo: input.motivo.trim(),
      p_devolver_estoque: input.devolverEstoque,
      p_modo: input.modo,
    });
    const payload = Array.isArray(result) && result.length === 1 ? result[0] : result;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma correção inválida.");
    }
    const row = payload as { equipment?: Equipamento<string>; portal?: unknown };
    if (!row.equipment || typeof row.equipment.id !== "string" || !validUuid(row.equipment.id)) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou um equipamento inválido.");
    }
    return {
      equipment: assertTenant(row.equipment, this.session),
      portal: parsePortal(row.portal),
    };
  }

  async extendApprovalDeadline(input: {
    equipmentId: string;
    expectedUpdatedAt: string;
    newDeadline: string;
  }): Promise<{ prorrogado: boolean; equipment: Equipamento<string> }> {
    assertOperationInput(input.equipmentId, input.expectedUpdatedAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newDeadline)) {
      throw new OnlineDataError("INVALID_DATA", "Informe o novo prazo no formato AAAA-MM-DD.");
    }
    const result = await this.rpc<unknown>("saas_prorrogar_prazo_orcamento", {
      p_equipment_id: input.equipmentId,
      p_expected_updated_em: input.expectedUpdatedAt,
      p_novo_prazo: input.newDeadline,
    });
    const payload = Array.isArray(result) && result.length === 1 ? result[0] : result;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou uma prorrogação inválida.");
    }
    const row = payload as { prorrogado?: boolean; equipment?: Equipamento<string> };
    if (row.prorrogado !== true || !row.equipment || typeof row.equipment.id !== "string" || !validUuid(row.equipment.id)) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online não confirmou a prorrogação do prazo.");
    }
    return { prorrogado: true, equipment: assertTenant(row.equipment, this.session) };
  }

  async listActiveServices(): Promise<ServicoCatalogo<string>[]> {
    const services: ServicoCatalogo<string>[] = [];
    for (let offset = 0; ; offset += SERVICE_PAGE_SIZE) {
      const query = new URLSearchParams({
        select: "id,empresa_id,nome,descricao,preco_padrao,pecas_sugeridas,ativo,criado_em,atualizado_em",
        empresa_id: `eq.${this.session.companyId}`,
        ativo: "eq.true",
        order: "nome.asc,id.asc",
        limit: String(SERVICE_PAGE_SIZE),
        offset: String(offset),
      });
      const rows = await this.request<ServicoCatalogo<string>[]>(`${this.session.supabaseUrl}/rest/v1/servicos_catalogo?${query}`);
      services.push(...rows.map((row) => {
        assertTenant(row, this.session);
        validatePecasSugeridas(row.pecas_sugeridas ?? []);
        return row;
      }));
      if (rows.length < SERVICE_PAGE_SIZE) return services;
    }
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
    const adjusted = quoteInputForAdjustment(input, input.adjustment);
    const rpcName = adjusted.adjustment?.modoAprovado
      ? "saas_save_equipment_quote_adjustment"
      : "saas_update_equipment_quote";
    const result = await this.rpc<unknown>(rpcName, {
      p_equipment_id: adjusted.equipmentId,
      p_expected_updated_em: adjusted.expectedUpdatedAt,
      p_services: adjusted.services,
      p_parts: adjusted.parts,
      p_total: adjusted.total,
      p_observations: adjusted.observations ?? null,
      p_new_status: adjusted.newStatus ?? null,
      p_approval_deadline: adjusted.approvalDeadline || null,
      p_payment_code: adjusted.payment?.codigo ?? null,
      p_payment_detail: adjusted.payment?.detalhe ?? null,
      p_correction_reason: adjusted.correctionReason ?? null,
      ...(adjusted.adjustment?.modoAprovado ? {
        p_modo_aprovado: adjusted.adjustment.modoAprovado,
        p_devolver_estoque: adjusted.adjustment.devolverEstoque === true,
      } : {}),
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

  async approveQuote(input: { equipmentId: string; expectedUpdatedAt: string; payment: FormaPagamento; servicesApproved?: string[] }): Promise<Equipamento<string>> {
    assertOperationInput(input.equipmentId, input.expectedUpdatedAt);
    const response = await this.rpc<unknown>(input.servicesApproved === undefined ? "saas_approve_equipment_quote" : "saas_approve_equipment_quote_with_stock", {
      p_equipment_id: input.equipmentId,
      p_expected_updated_em: input.expectedUpdatedAt,
      p_payment_code: input.payment.codigo,
      p_payment_detail: input.payment.detalhe ?? null,
      ...(input.servicesApproved === undefined ? {} : { p_services_approved: input.servicesApproved }),
    });
    const equipment = Array.isArray(response) && response.length === 1 ? response[0] as Equipamento<string> : response as Equipamento<string>;
    if (!equipment || typeof equipment.id !== "string" || !validUuid(equipment.id)) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou um equipamento inválido.");
    }
    return assertTenant(equipment, this.session);
  }

  async listPartsConsumption(equipmentId: string): Promise<EquipmentPartConsumption[]> {
    if (!validUuid(equipmentId)) throw new OnlineDataError("INVALID_DATA", "O identificador do equipamento Online é inválido.");
    const response = await this.rpc<unknown>("saas_list_equipment_quote_consumption", {
      p_equipment_id: equipmentId,
    });
    const rows = Array.isArray(response) ? response : [];
    return rows.map((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou consumos de peças inválidos.");
      }
      const row = candidate as EquipmentPartConsumption;
      const approved = Number(row.quantidade_aprovada);
      const debited = Number(row.quantidade_baixada);
      if (!validUuid(row.verificacao_id) || !validUuid(row.produto_id)
        || typeof row.servico_id !== "string" || typeof row.nome !== "string"
        || !Number.isSafeInteger(approved) || approved < 0
        || !Number.isSafeInteger(debited) || debited < 0 || debited > approved) {
        throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online retornou consumos de peças inválidos.");
      }
      return { ...row, quantidade_aprovada: approved, quantidade_baixada: debited };
    });
  }

  async consumePendingParts(equipmentId: string): Promise<number> {
    if (!validUuid(equipmentId)) throw new OnlineDataError("INVALID_DATA", "O identificador do equipamento Online é inválido.");
    const response = await this.rpc<unknown>("saas_consume_pending_equipment_parts", {
      p_equipment_id: equipmentId,
    });
    const candidate = Array.isArray(response) && response.length === 1 ? response[0] : response;
    const amount = Number(candidate);
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online não confirmou a baixa pendente. Atualize a lista antes de tentar novamente.");
    }
    return amount;
  }

  async registerCounterIntakeVerification(input: {
    equipmentId: string;
    technician: string;
    reportedProblem: string;
    diagnosis: string;
    observations: string;
  }): Promise<Verificacao> {
    if (!validUuid(input.equipmentId)) throw new OnlineDataError("INVALID_DATA", "O identificador do equipamento Online é inválido.");
    if (!input.technician.trim() || !input.reportedProblem.trim()) {
      throw new OnlineDataError("INVALID_DATA", "Informe técnico e defeito relatado para registrar a entrada.");
    }
    const response = await this.rpc<unknown>("saas_register_counter_intake_verification", {
      p_equipment_id: input.equipmentId,
      p_technician: input.technician.trim(),
      p_reported_problem: input.reportedProblem.trim(),
      p_diagnosis: input.diagnosis.trim(),
      p_observations: input.observations.trim(),
    });
    const candidate = Array.isArray(response) && response.length === 1 ? response[0] : response;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new OnlineDataError("ONLINE_UNAVAILABLE", "O serviço Online não confirmou a verificação inicial.");
    }
    const verification = candidate as Verificacao;
    if (typeof verification.id !== "string" || !validUuid(verification.id)
      || verification.equipamento_id !== input.equipmentId
      || String(verification.empresa_id ?? "") !== this.session.companyId) {
      throw new OnlineDataError("RLS_DENIED", "A resposta Online contém uma verificação fora da empresa autenticada.");
    }
    return verification;
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
