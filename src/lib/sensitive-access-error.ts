const DATABASE_ACCESS_LIMIT_MESSAGE =
  "O banco atingiu o limite de acessos ao mesmo tempo. Isso pode acontecer quando vários computadores ou tarefas usam o AutoOS juntos. Seu PIN não foi recusado. Aguarde um momento e tente novamente; se continuar, avise o responsável pelo sistema.";
const DATABASE_DELAY_MESSAGE =
  "O banco demorou para responder. Aguarde um momento e tente novamente; se continuar, avise o responsável pelo sistema.";
const DATABASE_ERROR_MESSAGE =
  "Não foi possível consultar o banco agora. Tente novamente; se continuar, avise o responsável pelo sistema.";

export function isTemporaryDatabaseAccessMessage(message: string): boolean {
  return message === DATABASE_ACCESS_LIMIT_MESSAGE || message === DATABASE_DELAY_MESSAGE || message === DATABASE_ERROR_MESSAGE;
}

export function sensitiveAccessErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : String(error ?? "");

  if (/EMAXCONNSESSION|MaxClientsInSessionMode|max clients reached|\b53300\b|too many clients/i.test(message)) {
    return DATABASE_ACCESS_LIMIT_MESSAGE;
  }

  if (/pool timed out|timed out while waiting for an open connection/i.test(message)) {
    return DATABASE_DELAY_MESSAGE;
  }

  if (/error returned from database/i.test(message)) {
    return DATABASE_ERROR_MESSAGE;
  }

  return message || fallback;
}
