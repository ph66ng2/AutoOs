const DATABASE_ACCESS_LIMIT_MESSAGE =
  "O banco atingiu o limite de acessos ao mesmo tempo. Isso pode acontecer quando vários computadores ou tarefas usam o AutoOS juntos. Seu PIN não foi recusado. Aguarde um momento e tente novamente; se continuar, avise o responsável pelo sistema.";

export function sensitiveAccessErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : String(error ?? "");

  if (/EMAXCONNSESSION|max clients reached in session mode/i.test(message)) {
    return DATABASE_ACCESS_LIMIT_MESSAGE;
  }

  return message || fallback;
}
