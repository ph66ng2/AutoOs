import { toast } from 'sonner';
import { formatAppError, copyErrorDetails, formatToastMessage } from '@/lib/error-utils';

/**
 * Hook de notificações padronizadas.
 * Encapsula o Sonner com formato consistente: "[Contexto] — Ação"
 * 
 * @example
 * const { success, error, warning, info } = useNotification();
 * success("Equipamentos", "Equipamento salvo com sucesso.", "Salvar");
 * error("Equipamentos", "Salvar equipamento", err);
 * warning("Equipamentos", "Nenhuma verificação encontrada.");
 * info("Equipamentos", "Enviando email...");
 */
export function useNotification() {
  const success = (context: string, message: string, action?: string) => {
    toast.success(formatToastMessage({ context, action, message }), {
      description: message,
      duration: 3000,
    });
  };

  const error = (context: string, action: string, error: unknown) => {
    const appError = formatAppError({ context, action, error });
    const errMsg = appError.message;
    toast.error(formatToastMessage({ context, action, message: errMsg }), {
      description: errMsg,
      duration: Infinity,
      action: {
        label: 'Copiar detalhes',
        onClick: () => { copyErrorDetails(appError); },
      },
    });
  };

  const warning = (context: string, message: string, action?: string) => {
    toast.warning(formatToastMessage({ context, action, message }), {
      description: message,
      duration: 5000,
    });
  };

  const info = (context: string, message: string, action?: string) => {
    toast.info(formatToastMessage({ context, action, message }), {
      description: message,
      duration: 4000,
    });
  };

  return { success, error, warning, info };
}
