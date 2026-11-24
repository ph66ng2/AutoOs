import { createContext, useCallback, useContext, useEffect, useRef, useState, type Context, type ReactNode } from "react";
import * as Roteador from "react-router-dom";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface AvisoAoSair {
  /** Diálogo "Sair sem salvar?"; a tela o coloca em qualquer lugar do seu JSX. */
  dialogo: ReactNode;
  /** A próxima navegação passa sem aviso (ex.: logo depois de salvar). */
  liberarProximaSaida: () => void;
  /**
   * Saída pelos botões da própria tela (seta de voltar, Esc, Cancelar): limpa, chama `sair` na
   * hora; com algo pela metade, abre o mesmo "Sair sem salvar?" e só chama `sair` (com a próxima
   * navegação liberada) depois de "Sair sem salvar". "Continuar editando" não muda nada.
   */
  sairComAviso: (sair: () => void) => void;
}

/** Contexto do roteador com dados; ausente em testes que simulam o react-router só em parte. */
function contextoDoRoteador() {
  try {
    return Roteador.UNSAFE_DataRouterContext ?? null;
  } catch {
    return null;
  }
}
const SEM_ROTEADOR = createContext<unknown>(null);

type Bloqueio = ReturnType<typeof Roteador.useBlocker>;

/**
 * Avisa antes de sair de um formulário pela metade: menu, Ctrl+K, voltar do navegador e, por
 * `sairComAviso`, os botões de saída da própria tela. Um único diálogo para os dois caminhos.
 * `saidaLivre` diz para onde se pode ir sem aviso (ex.: Cancelar/Finalizar voltam à origem).
 * Fechar a janela do app não passa por aqui: para isso há o rascunho automático.
 * Fora do roteador com dados (testes com MemoryRouter) só a navegação fica sem aviso;
 * `sairComAviso` continua perguntando.
 */
export function useAvisoAoSair(sujo: boolean, saidaLivre?: (pathname: string) => boolean): AvisoAoSair {
  const comDados = useContext((contextoDoRoteador() ?? SEM_ROTEADOR) as Context<unknown>) != null;
  const sujoRef = useRef(sujo);
  sujoRef.current = sujo;
  const livreRef = useRef(saidaLivre);
  livreRef.current = saidaLivre;
  const liberado = useRef(false);

  // O roteador com dados existe ou não pela vida inteira da tela: a chamada condicional é estável.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const blocker: Bloqueio | null = comDados ? Roteador.useBlocker(({ currentLocation, nextLocation }) => {
    if (liberado.current) {
      liberado.current = false;
      return false;
    }
    if (!sujoRef.current || currentLocation.pathname === nextLocation.pathname) return false;
    return !(livreRef.current?.(nextLocation.pathname) ?? false);
  }) : null;
  const bloqueado = blocker?.state === "blocked";

  // Saída pedida por um botão da tela, esperando a resposta do aviso.
  const [saidaPendente, setSaidaPendente] = useState<(() => void) | null>(null);

  // Ficou limpo com o aviso aberto (ex.: salvou por outro caminho): deixa seguir.
  useEffect(() => {
    if (bloqueado && !sujo) blocker?.proceed?.();
  }, [blocker, bloqueado, sujo]);
  // Com a saída por botão, ficar limpo só fecha o aviso: sair agora seria uma ação não pedida.
  useEffect(() => {
    if (saidaPendente && !sujo) setSaidaPendente(null);
  }, [saidaPendente, sujo]);

  // Vale só para a navegação disparada logo em seguida (o bloqueio é conferido na hora do
  // navigate); se nenhuma acontecer, a liberação expira e não vaza para um clique posterior.
  const liberarProximaSaida = useCallback(() => {
    liberado.current = true;
    window.setTimeout(() => { liberado.current = false; }, 0);
  }, []);

  const sairComAviso = useCallback((sair: () => void) => {
    if (!sujoRef.current) {
      sair();
      return;
    }
    setSaidaPendente(() => sair);
  }, []);

  // O ConfirmDialog chama onConfirm/onCancel e depois onOpenChange(false): só a primeira decide.
  const aberto = bloqueado || saidaPendente != null;
  const decidido = useRef(false);
  useEffect(() => { if (aberto) decidido.current = false; }, [aberto]);
  const decidir = (seguir: boolean) => {
    if (decidido.current || !aberto) return;
    decidido.current = true;
    if (saidaPendente) {
      const sair = saidaPendente;
      setSaidaPendente(null);
      if (seguir) {
        liberarProximaSaida();
        sair();
      }
      return;
    }
    if (seguir) blocker?.proceed?.();
    else blocker?.reset?.();
  };

  const dialogo = (
    <ConfirmDialog
      open={aberto}
      onOpenChange={(abrir) => { if (!abrir) decidir(false); }}
      title="Sair sem salvar?"
      description="O que foi preenchido nesta tela ainda não foi salvo e será perdido."
      confirmLabel="Sair sem salvar"
      cancelLabel="Continuar editando"
      variant="destructive"
      onConfirm={() => decidir(true)}
      onCancel={() => decidir(false)}
    />
  );
  return { dialogo, liberarProximaSaida, sairComAviso };
}
