import { AppError, NotificationMessage, NotificationType } from '@/types/notification';
import { lerCodigoTecnico, mensagemVisivelAoOperador } from '@/lib/operator-errors';

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

  const original = message;
  const tecnico = lerCodigoTecnico(message);
  const visivel = mensagemVisivelAoOperador(message);
  if (visivel) {
    message = visivel;
    technicalDetails = undefined;
  }

  return {
    type: 'error',
    context: params.context,
    action: params.action,
    message,
    technicalDetails,
    codigo: tecnico?.codigo,
    referencia: tecnico?.referencia,
    descricaoTecnica: tecnico?.descricao,
    // Sem código estruturado, o texto que chegou já é o detalhe técnico (ex.: erro de validação do Rust).
    mensagemOriginal: tecnico ? undefined : original,
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

let versaoCache: string | undefined;

/** Versão do app (Tauri). Carregada uma vez em segundo plano; vazia no navegador/testes. */
export function versaoDoApp(): string | undefined {
  return versaoCache;
}

if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
  void import('@tauri-apps/api/app')
    .then(({ getVersion }) => getVersion())
    .then((versao) => { versaoCache = versao; })
    .catch(() => undefined);
}

/**
 * Copia os detalhes de um erro para o clipboard em formato legível.
 * Retorna true se copiou com sucesso, false se o clipboard falhou.
 */
export async function copyErrorDetails(error: AppError): Promise<boolean> {
  const details = formatErrorForCopy(error, { versao: versaoDoApp() });
  try {
    await navigator.clipboard.writeText(details);
    return true;
  } catch {
    return false;
  }
}

/**
 * Texto que o operador copia para mandar ao suporte. Diferente do aviso (feito para o
 * operador), leva código, explicação técnica, referência do log, tela e versão.
 * Os dados do banco (valores, nomes de tabela) continuam só no log, achados pela referência.
 */
export function formatErrorForCopy(error: AppError, ambiente?: { tela?: string; versao?: string }): string {
  const lines = [
    'AutoOS — relatório de erro',
    `Código: ${error.codigo ?? 'sem código (erro direto do comando)'}`,
  ];
  if (error.descricaoTecnica) lines.push(`Descrição técnica: ${error.descricaoTecnica}`);
  if (error.referencia) lines.push(`Referência no log: ${error.referencia}`);
  lines.push(
    `Contexto: ${error.context}`,
    `Ação: ${error.action}`,
    `Mensagem: ${error.message}`,
  );
  if (error.mensagemOriginal && error.mensagemOriginal !== error.message) {
    lines.push(`Resposta original: ${error.mensagemOriginal}`);
  }
  lines.push(`Data/Hora: ${error.timestamp.toISOString()} (local ${error.timestamp.toLocaleString('pt-BR')})`);
  const tela = ambiente?.tela ?? (typeof window !== 'undefined' ? window.location.pathname : undefined);
  if (tela) lines.push(`Tela: ${tela}`);
  if (ambiente?.versao) lines.push(`Versão: ${ambiente.versao}`);
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
