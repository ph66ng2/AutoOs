import { AppError, NotificationMessage, NotificationType } from '@/types/notification';

/**
 * Formata um erro desconhecido (Error, string, unknown) em um AppError estruturado
 * com contexto (onde), ação (o quê), mensagem amigável e detalhes técnicos.
 */
export function formatAppError(params: {
  context: string;
  action: string;
  error: unknown;
}): AppError {
  const error = params.error;
  let message = 'Ocorreu um erro inesperado.';
  let technicalDetails: string | undefined;

  if (error instanceof Error) {
    message = error.message || message;
    technicalDetails = error.stack;
  } else if (typeof error === 'string') {
    message = error;
  }

  return {
    type: 'error',
    context: params.context,
    action: params.action,
    message,
    technicalDetails,
    originalError: error,
    timestamp: new Date(),
  };
}

/**
 * Cria uma mensagem de notificação padronizada para uso com o sistema de toasts.
 */
export function createNotificationMessage(params: {
  type: NotificationType;
  context: string;
  action?: string;
  message: string;
  technicalDetails?: string;
}): NotificationMessage {
  return {
    type: params.type,
    context: params.context,
    action: params.action,
    message: params.message,
    technicalDetails: params.technicalDetails,
  };
}

/**
 * Copia os detalhes de um erro para o clipboard em formato legível.
 * Retorna true se copiou com sucesso, false se o clipboard falhou.
 */
export async function copyErrorDetails(error: AppError): Promise<boolean> {
  const details = formatErrorForCopy(error);
  try {
    await navigator.clipboard.writeText(details);
    return true;
  } catch {
    return false;
  }
}

/**
 * Formata um AppError em string legível para cópia/exportação.
 */
export function formatErrorForCopy(error: AppError): string {
  const lines = [
    `Contexto: ${error.context}`,
    `Ação: ${error.action}`,
    `Mensagem: ${error.message}`,
    `Data/Hora: ${error.timestamp.toISOString()}`,
  ];
  if (error.technicalDetails) {
    lines.push('', '--- Detalhes Técnicos ---', error.technicalDetails);
  }
  return lines.join('\n');
}

/**
 * Gera título de toast no formato padronizado: "[Contexto] — Ação"
 */
export function formatToastMessage(params: {
  context: string;
  action?: string;
  message: string;
}): string {
  if (params.action) {
    return `${params.context} — ${params.action}`;
  }
  return params.message;
}

// Mantém compatibilidade com funções existentes do projeto
export { traduzirErroSalvarEquipamento } from '@/pages/equipamentos/equipamentos-page-utils';
export { whatsappNaoConfigurado } from '@/pages/equipamentos/equipamentos-page-utils';
