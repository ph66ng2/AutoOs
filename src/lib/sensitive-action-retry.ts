type SensitiveAccessPrompt = () => Promise<boolean>;

let promptHandler: SensitiveAccessPrompt | null = null;
let promptInFlight: Promise<boolean> | null = null;

function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error ?? "");
}

export function isSensitiveAccessLockedError(error: unknown): boolean {
  const message = errorMessage(error).toLocaleLowerCase("pt-BR");
  return message.includes("acesso sensível bloqueado") || message.includes("sessão sensível bloqueada");
}

/** Registra o diálogo global sem acoplar a camada de dados ao React. */
export function registerSensitiveAccessPrompt(handler: SensitiveAccessPrompt): () => void {
  promptHandler = handler;
  return () => {
    if (promptHandler === handler) promptHandler = null;
  };
}

async function requestSensitiveAccess(): Promise<boolean> {
  if (!promptHandler) return false;
  if (!promptInFlight) {
    promptInFlight = promptHandler().finally(() => {
      promptInFlight = null;
    });
  }
  return promptInFlight;
}

/** Repete uma vez apenas quando o backend informa que a sessão sensível expirou. */
export async function withSensitiveAccessRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isSensitiveAccessLockedError(error)) throw error;

    const unlocked = await requestSensitiveAccess();
    if (!unlocked) throw error;
    return operation();
  }
}
