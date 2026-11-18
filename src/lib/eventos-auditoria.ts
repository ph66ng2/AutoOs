/** Nome de cada evento de auditoria para quem lê (Perfil › Visão geral e Equipe e acessos). */
export const EVENT_LABELS: Record<string, string> = {
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
