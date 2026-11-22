import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { formatAppError, copyErrorDetails, formatarRelatorioSuporte, formatToastMessage } from '@/lib/error-utils';
import { enviarErroAoSuporte, suporteDisponivel } from '@/lib/suporte-ponte';
import { registrarErro } from '@/lib/error-log';

/** Prefixo do id dos toasts de erro; o painel de notificações recolhe esses avisos ao abrir. */
export const PREFIXO_TOAST_ERRO = 'erro-app-';

/**
 * Tempo do aviso de erro na tela. Some sozinho (pausa com o mouse em cima, tem o X):
 * o erro continua no sino › Sistema, com "Enviar ao suporte"/copiar, então nada se perde.
 */
export const DURACAO_TOAST_ERRO = 8000;

/**
 * Erros mostrados logo antes de uma navegação que os leva para outra tela
 * (ex.: "Abrir edição" falhou e a tela volta para a lista). Sobrevivem à próxima troca de tela.
 */
const errosQueSobrevivemATroca = new Set<string>();

/**
 * Fecha os avisos de erro do app ainda na tela (são da tela em que o erro aconteceu).
 * Os marcados com `manterAoTrocarDeTela` ficam e perdem a marca: fecham na troca seguinte.
 */
export function fecharAvisosDeErro() {
  for (const aviso of toast.getToasts()) {
    const id = String(aviso.id);
    if (!id.startsWith(PREFIXO_TOAST_ERRO)) continue;
    if (errosQueSobrevivemATroca.delete(id)) continue;
    toast.dismiss(aviso.id);
  }
  errosQueSobrevivemATroca.clear();
}

/** Ao trocar de tela (rota), fecha os avisos de erro da tela anterior. Montado no Layout. */
export function useFecharErrosAoTrocarDeTela() {
  const { pathname } = useLocation();
  const anterior = useRef(pathname);
  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    fecharAvisosDeErro();
  }, [pathname]);
}

/**
 * Mostra o aviso de erro e guarda o erro na aba "Erros" das notificações.
 * Pode ser chamado fora de componentes (ex.: providers, callbacks).
 */
export interface OpcoesAvisoErro {
  /** O erro é seguido de uma navegação (ex.: volta para a lista): não fechar na próxima troca de tela. */
  manterAoTrocarDeTela?: boolean;
}

export function notificarErro(context: string, action: string, error: unknown, opcoes?: OpcoesAvisoErro) {
  const appError = formatAppError({ context, action, error });
  const registrado = registrarErro(appError);
  const errMsg = appError.message;
  const idToast = `${PREFIXO_TOAST_ERRO}${registrado.id}`;
  if (opcoes?.manterAoTrocarDeTela) errosQueSobrevivemATroca.add(idToast);
  toast.error(formatToastMessage({ context, action, message: errMsg }), {
    id: idToast,
    description: errMsg,
    duration: DURACAO_TOAST_ERRO,
    // Com o banco conectado, o erro vai direto para um chamado de suporte; copiar continua no sino.
    action: suporteDisponivel()
      ? {
          label: 'Enviar ao suporte',
          onClick: () => enviarErroAoSuporte(formatarRelatorioSuporte(appError, registrado.id)),
        }
      : {
          label: 'Copiar detalhes',
          onClick: () => {
            void copyErrorDetails(appError).then((ok) => {
              if (ok) toast.success('Relatório técnico do erro copiado', { duration: 2500 });
              else toast.warning('Não foi possível copiar. Abra o sino > Erros e copie de lá.', { duration: 5000 });
            });
          },
        },
  });
  return registrado;
}

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

  const error = (context: string, action: string, error: unknown, opcoes?: OpcoesAvisoErro) => {
    notificarErro(context, action, error, opcoes);
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
