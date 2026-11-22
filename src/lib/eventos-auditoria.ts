import { STATUS_LABELS, type StatusEquipamento } from "@/types";

/** Nome de cada evento de auditoria para quem lê (Perfil › Visão geral e Equipe e acessos). */
export const EVENT_LABELS: Record<string, string> = {
  EQUIPMENT_STATUS_UPDATED: "Atualizou o status da OS",
  EQUIPMENT_STATUS_CORRECTED: "Corrigiu o status da OS",
  BUDGET_PUBLISHED_TO_PORTAL: "Publicou o orçamento no portal",
  BUDGET_EMAIL_SENT: "Enviou o orçamento por e-mail",
  BUDGET_APPROVED: "Aprovou o orçamento",
  BUDGET_REJECTED: "Reprovou o orçamento",
  PROFILE_SWITCH: "Entrou no perfil",
  UNLOCK_SUCCESS: "Desbloqueou a sessão",
  SESSION_UNLOCKED_NO_PIN: "Desbloqueou a sessão",
  LOCK: "Bloqueou a sessão",
  PIN_CHANGED: "Trocou o PIN",
  ACCESS_CODE_REDEEMED: "Ativou o perfil em um computador",
  PROFILE_RENAMED: "Mudou o nome do perfil",
  PROFILE_CREATED: "Criou um perfil",
  PROFILE_UPDATED: "Alterou um perfil",
  ACCESS_CODE_ISSUED: "Gerou um código de acesso",
};

/** Resume os detalhes de mudanças de status no formato legado do log. */
export function resumirStatusAuditado(detalhes: string | null | undefined): string | null {
  const id = detalhes?.match(/(?:^|; )equipamento_id=(\d+)(?:;|$)/)?.[1];
  const anterior = detalhes?.match(/(?:^|; )status_anterior=([A-Z_]+)(?:;|$)/)?.[1];
  const atual = detalhes?.match(/(?:^|; )status=([A-Z_]+)(?:;|$)/)?.[1];
  if (!id || !anterior || !atual) return null;
  const de = STATUS_LABELS[anterior as StatusEquipamento];
  const para = STATUS_LABELS[atual as StatusEquipamento];
  return de && para ? `OS #${id} · ${de} → ${para}` : null;
}
