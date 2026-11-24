import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type Context, type ReactNode } from "react";
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
  /** Há algo não salvo agora (nesta tela ou num formulário dentro do seu escopo). */
  algoNaoSalvo: boolean;
  /** Para `<EscopoAvisoAoSair>`: os formulários de dentro passam a usar este aviso. */
  escopo: EscopoAviso;
}

/** O que um formulário de dentro precisa do aviso da tela. */
export interface EscopoAviso {
  informar: (chave: string, sujo: boolean) => void;
  liberarProximaSaida: () => void;
  sairComAviso: (sair: () => void) => void;
}

const EscopoContext = createContext<EscopoAviso | null>(null);

/**
 * Tela com vários formulários (cartões com "Salvar" próprio, abas): cada `useAvisoAoSair` de
 * dentro deixa de ter bloqueio e diálogo próprios e só informa se está sujo a este aviso. Assim
 * há um único bloqueio de navegação (o roteador aceita um por vez) e as saídas da tela que não
 * são navegação (trocar de aba, trocar de operador) passam por `aviso.sairComAviso`.
 */
export function EscopoAvisoAoSair({ aviso, children }: { aviso: AvisoAoSair; children: ReactNode }) {
  return <EscopoContext.Provider value={aviso.escopo}>{children}</EscopoContext.Provider>;
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
 * Dentro de `<EscopoAvisoAoSair>` o hook só informa `sujo` ao aviso de fora e devolve as funções
 * dele (`dialogo` vazio, `saidaLivre` ignorado).
 */
export function useAvisoAoSair(sujo: boolean, saidaLivre?: (pathname: string) => boolean): AvisoAoSair {
  const comDados = useContext((contextoDoRoteador() ?? SEM_ROTEADOR) as Context<unknown>) != null;
  const pai = useContext(EscopoContext);
  const chave = useId();
  // Dentro de um escopo: só informa. Ao desmontar (ex.: a aba trocou), deixa de contar.
  useEffect(() => { pai?.informar(chave, sujo); }, [pai, chave, sujo]);
  useEffect(() => () => pai?.informar(chave, false), [pai, chave]);

  // Formulários de dentro que estão sujos agora.
  const [filhosSujos, setFilhosSujos] = useState<ReadonlySet<string>>(() => new Set());
  const informar = useCallback((filho: string, filhoSujo: boolean) => {
    setFilhosSujos((atual) => {
      if (atual.has(filho) === filhoSujo) return atual;
      const proximo = new Set(atual);
      if (filhoSujo) proximo.add(filho);
      else proximo.delete(filho);
      return proximo;
    });
  }, []);
  const sujoDaTela = pai == null && (sujo || filhosSujos.size > 0);

  const sujoRef = useRef(sujoDaTela);
  sujoRef.current = sujoDaTela;
  const livreRef = useRef(saidaLivre);
  livreRef.current = saidaLivre;
  const liberado = useRef(false);

  // O roteador com dados e o escopo existem ou não pela vida inteira da tela: a chamada
  // condicional é estável.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const blocker: Bloqueio | null = comDados && pai == null ? Roteador.useBlocker(({ currentLocation, nextLocation }) => {
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
    if (bloqueado && !sujoDaTela) blocker?.proceed?.();
  }, [blocker, bloqueado, sujoDaTela]);
  // Com a saída por botão, ficar limpo só fecha o aviso: sair agora seria uma ação não pedida.
  useEffect(() => {
    if (saidaPendente && !sujoDaTela) setSaidaPendente(null);
  }, [saidaPendente, sujoDaTela]);

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
  const escopo = useMemo<EscopoAviso>(
    () => pai ?? { informar, liberarProximaSaida, sairComAviso },
    [pai, informar, liberarProximaSaida, sairComAviso],
  );
  if (pai) {
    return { dialogo: null, liberarProximaSaida: pai.liberarProximaSaida, sairComAviso: pai.sairComAviso, algoNaoSalvo: sujo, escopo };
  }
  return { dialogo, liberarProximaSaida, sairComAviso, algoNaoSalvo: sujoDaTela, escopo };
}
