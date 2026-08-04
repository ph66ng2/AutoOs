import { STATUS_EQUIPAMENTO, STATUS_LABELS, type StatusEquipamento } from "@/types";

export { STATUS_EQUIPAMENTO };
export type { StatusEquipamento };

/**
 * Mapa de transições válidas entre os 12 status do fluxo de manutenção.
 *
 * Fluxo principal:
 *   RECEBIDO → EM_VERIFICACAO → VERIFICADO → AGUARDANDO_APROVACAO →
 *   APROVADO → EM_MANUTENCAO → PRONTO → ENTREGUE
 *
 * Fluxos alternativos:
 *   AGUARDANDO_APROVACAO → REPROVADO | ORCAMENTO_VENCIDO
 *   EM_MANUTENCAO → AGUARDANDO_PECA
 *   REPROVADO → ENTREGUE | ABANDONADO
 *   ORCAMENTO_VENCIDO → ABANDONADO | AGUARDANDO_APROVACAO
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  RECEBIDO: ["EM_VERIFICACAO"],
  EM_VERIFICACAO: ["VERIFICADO"],
  VERIFICADO: ["AGUARDANDO_APROVACAO"],
  AGUARDANDO_APROVACAO: ["APROVADO", "REPROVADO", "ORCAMENTO_VENCIDO"],
  APROVADO: ["EM_MANUTENCAO"],
  EM_MANUTENCAO: ["AGUARDANDO_PECA", "PRONTO"],
  AGUARDANDO_PECA: ["EM_MANUTENCAO"],
  PRONTO: ["ENTREGUE"],
  REPROVADO: ["ENTREGUE", "ABANDONADO"],
  ORCAMENTO_VENCIDO: ["ABANDONADO", "AGUARDANDO_APROVACAO"],
  ENTREGUE: [],
  ABANDONADO: [],
};

/**
 * Normaliza um status para a chave canônica em maiúsculas.
 * Suporta tanto rótulos legíveis (ex: "Em Verificação") quanto
 * chaves já normalizadas (ex: "EM_VERIFICACAO").
 *
 * Espelha a função `normalize_status_key` do backend Rust
 * (src-tauri/src/commands/equipamentos.rs).
 */
export function normalizeStatusKey(status: string): string {
  const trimmed = status.trim();
  switch (trimmed) {
    case "Recebido":
    case "RECEBIDO":
      return "RECEBIDO";
    case "Em Verificação":
    case "EM_VERIFICACAO":
      return "EM_VERIFICACAO";
    case "Verificado":
    case "VERIFICADO":
      return "VERIFICADO";
    case "Aguardando Aprovação":
    case "AGUARDANDO_APROVACAO":
      return "AGUARDANDO_APROVACAO";
    case "Aprovado":
    case "APROVADO":
      return "APROVADO";
    case "Reprovado":
    case "REPROVADO":
      return "REPROVADO";
    case "Em Manutenção":
    case "EM_MANUTENCAO":
      return "EM_MANUTENCAO";
    case "Aguardando Peça":
    case "AGUARDANDO_PECA":
      return "AGUARDANDO_PECA";
    case "Pronto":
    case "PRONTO":
      return "PRONTO";
    case "Entregue":
    case "ENTREGUE":
      return "ENTREGUE";
    case "Orçamento Vencido":
    case "ORCAMENTO_VENCIDO":
      return "ORCAMENTO_VENCIDO";
    case "Abandonado":
    case "ABANDONADO":
      return "ABANDONADO";
    default:
      return trimmed;
  }
}

/**
 * Verifica se uma transição de status é permitida.
 *
 * @param from — Status atual (pode ser rótulo ou chave canônica)
 * @param to   — Status desejado (pode ser rótulo ou chave canônica)
 * @returns `true` se a transição está no mapa de transições válidas
 *          ou se from === to (permanecer no mesmo status é sempre válido)
 */
export function canTransition(from: string, to: string): boolean {
  const normalizedFrom = normalizeStatusKey(from);
  const normalizedTo = normalizeStatusKey(to);
  if (normalizedFrom === normalizedTo) return true;
  const nextStates = VALID_TRANSITIONS[normalizedFrom] || [];
  return nextStates.includes(normalizedTo);
}

/**
 * Retorna os próximos status permitidos a partir do status atual.
 *
 * @param current — Status atual (pode ser rótulo ou chave canônica)
 * @returns Array de chaves canônicas dos status destino permitidos
 */
export function getNextStates(current: string): string[] {
  const normalized = normalizeStatusKey(current);
  return [...(VALID_TRANSITIONS[normalized] || [])];
}

/**
 * Retorna mensagem de erro para transições proibidas.
 *
 * @param from — Status atual
 * @param to   — Status desejado
 * @returns Mensagem legível em PT-BR, ou `null` se a transição for válida
 */
export function getTransitionError(from: string, to: string): string | null {
  if (canTransition(from, to)) return null;
  const normalizedFrom = normalizeStatusKey(from);
  const normalizedTo = normalizeStatusKey(to);
  const fromLabel = STATUS_LABELS[normalizedFrom as StatusEquipamento] || normalizedFrom;
  const toLabel = STATUS_LABELS[normalizedTo as StatusEquipamento] || normalizedTo;
  return `Transição de status inválida: não é permitido mudar de "${fromLabel}" para "${toLabel}"`;
}

/**
 * Determina se uma mudança de status exige acesso sensível (permissão
 * FINANCIAL_ACTIONS).
 *
 * Espelha a função `status_change_requires_sensitive_access` do backend Rust
 * (src-tauri/src/commands/equipamentos.rs).
 *
 * @param normalizedStatus — Status canônico (já normalizado)
 * @param valorOrcamento     — Valor do orçamento, se informado
 * @param prazoAprovacao     — Prazo de aprovação, se informado
 * @param valorFinal         — Valor final cobrado, se informado
 */
export function statusChangeRequiresSensitiveAccess(
  normalizedStatus: string,
  valorOrcamento?: number | null,
  prazoAprovacao?: string | null,
  valorFinal?: number | null
): boolean {
  return (
    valorOrcamento != null ||
    (prazoAprovacao != null && prazoAprovacao.trim().length > 0) ||
    valorFinal != null ||
    [
      "AGUARDANDO_APROVACAO",
      "APROVADO",
      "REPROVADO",
      "ORCAMENTO_VENCIDO",
      "ENTREGUE",
      "ABANDONADO",
    ].includes(normalizedStatus)
  );
}

/**
 * Retorna o nome do campo de data que deve ser atualizado automaticamente
 * quando o equipamento entra em um determinado status.
 *
 * Espelha a lógica do Rust em `atualizar_status_equipamento`
 * (src-tauri/src/commands/equipamentos.rs).
 *
 * @param normalizedStatus — Status canônico (já normalizado)
 * @returns Nome do campo de data (ex: "data_aprovacao") ou `null`
 */
export function getDateFieldForStatus(normalizedStatus: string): string | null {
  switch (normalizedStatus) {
    case "APROVADO":
      return "data_aprovacao";
    case "REPROVADO":
      return "data_reprovacao";
    case "EM_VERIFICACAO":
    case "EM_MANUTENCAO":
      return "data_verificacao";
    case "PRONTO":
      return "data_pronto";
    case "ENTREGUE":
      return "data_saida";
    default:
      return null;
  }
}
