import { useEffect, useRef } from "react";

export interface AcoesAtalho {
  abrirBusca: () => void;
  abrirAjuda: () => void;
  novaEntrada: () => void;
}

function editavel(alvo: EventTarget | null) {
  if (!(alvo instanceof HTMLElement)) return false;
  return alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) || alvo.getAttribute("role") === "combobox";
}

/** Primeira caixa de busca da tela (as listas usam "Pesquisar…"/"Buscar…"). */
export function caixaDeBuscaDaTela(raiz: ParentNode = document): HTMLInputElement | null {
  return raiz.querySelector<HTMLInputElement>(
    'main input[type="search"], main input[aria-label^="Pesquisar"], main input[aria-label^="Buscar"], main input[placeholder^="Buscar"]',
  );
}

/**
 * Atalhos do app inteiro. Ctrl+K vale também dentro de campos; as letras só fora deles.
 * Nenhum vale com janela modal aberta (o convite do tour não conta).
 * Assim nunca roubam o que a pessoa está digitando nem trocam a tela por baixo de uma operação.
 */
export function useAtalhosGlobais(acoes: AcoesAtalho) {
  const ref = useRef(acoes);
  ref.current = acoes;
  useEffect(() => {
    const aoTeclar = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      // Com uma janela modal aberta (mudança de status, cadastro…) nada navega por atalho:
      // trocar de equipamento por baixo dela aplicaria a operação no equipamento errado.
      const janelaAberta = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') != null;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        if (janelaAberta) return;
        event.preventDefault();
        ref.current.abrirBusca();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (editavel(event.target) || janelaAberta) return;
      if (event.key === "/") {
        const caixa = caixaDeBuscaDaTela();
        if (!caixa) return;
        event.preventDefault();
        caixa.focus();
        caixa.select();
      } else if (event.key === "?") {
        event.preventDefault();
        ref.current.abrirAjuda();
      } else if (event.key.toLowerCase() === "n" && !event.shiftKey) {
        event.preventDefault();
        ref.current.novaEntrada();
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);
}
