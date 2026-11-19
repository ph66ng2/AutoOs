import { createContext, useCallback, useContext, useEffect, useRef, type Context, type ReactNode } from "react";
import * as Roteador from "react-router-dom";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface AvisoAoSair {
  /** Diálogo "Sair sem salvar?"; a tela o coloca em qualquer lugar do seu JSX. */
  dialogo: ReactNode;
  /** A próxima navegação passa sem aviso (ex.: logo depois de salvar). */
  liberarProximaSaida: () => void;
}

/**
 * Avisa antes de sair de um formulário pela metade: menu, Ctrl+K, voltar do navegador.
 * `saidaLivre` diz para onde se pode ir sem aviso (ex.: Cancelar/Finalizar voltam à origem).
 * Fechar a janela do app não passa por aqui: para isso há o rascunho automático.
 * Fora do roteador com dados (testes com MemoryRouter) o aviso fica desligado.
 */
/** Contexto do roteador com dados; ausente em testes que simulam o react-router só em parte. */
function contextoDoRoteador() {
  try {
    return Roteador.UNSAFE_DataRouterContext ?? null;
  } catch {
    return null;
  }
}
const SEM_ROTEADOR = createContext<unknown>(null);

export function useAvisoAoSair(sujo: boolean, saidaLivre?: (pathname: string) => boolean): AvisoAoSair {
  const comDados = useContext((contextoDoRoteador() ?? SEM_ROTEADOR) as Context<unknown>) != null;
  // O roteador com dados existe ou não pela vida inteira da tela: a chamada condicional é estável.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return comDados ? useAvisoComRoteador(sujo, saidaLivre) : { dialogo: null, liberarProximaSaida: () => undefined };
}

function useAvisoComRoteador(sujo: boolean, saidaLivre?: (pathname: string) => boolean): AvisoAoSair {
  const sujoRef = useRef(sujo);
  sujoRef.current = sujo;
  const livreRef = useRef(saidaLivre);
  livreRef.current = saidaLivre;
  const liberado = useRef(false);

  const blocker = Roteador.useBlocker(({ currentLocation, nextLocation }) => {
    if (liberado.current) {
      liberado.current = false;
      return false;
    }
    if (!sujoRef.current || currentLocation.pathname === nextLocation.pathname) return false;
    return !(livreRef.current?.(nextLocation.pathname) ?? false);
  });

  // Ficou limpo com o aviso aberto (ex.: salvou por outro caminho): deixa seguir.
  useEffect(() => {
    if (blocker.state === "blocked" && !sujo) blocker.proceed();
  }, [blocker, sujo]);

  // Vale só para a navegação disparada logo em seguida (o bloqueio é conferido na hora do
  // navigate); se nenhuma acontecer, a liberação expira e não vaza para um clique posterior.
  const liberarProximaSaida = useCallback(() => {
    liberado.current = true;
    window.setTimeout(() => { liberado.current = false; }, 0);
  }, []);
  // O ConfirmDialog chama onConfirm/onCancel e depois onOpenChange(false): só a primeira decide.
  const decidido = useRef(false);
  useEffect(() => { if (blocker.state === "blocked") decidido.current = false; }, [blocker.state]);
  const decidir = (seguir: boolean) => {
    if (decidido.current || blocker.state !== "blocked") return;
    decidido.current = true;
    if (seguir) blocker.proceed();
    else blocker.reset();
  };

  const dialogo = (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      onOpenChange={(aberto) => { if (!aberto) decidir(false); }}
      title="Sair sem salvar?"
      description="O que foi preenchido nesta tela ainda não foi salvo e será perdido."
      confirmLabel="Sair sem salvar"
      cancelLabel="Continuar editando"
      variant="destructive"
      onConfirm={() => decidir(true)}
      onCancel={() => decidir(false)}
    />
  );
  return { dialogo, liberarProximaSaida };
}
