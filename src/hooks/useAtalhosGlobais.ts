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
 * Atalhos do app inteiro. Ctrl+K vale sempre; as letras só fora de campos de texto
 * e sem janela modal aberta (o convite do tour não conta), para nunca roubar o que a pessoa está digitando.
 */
export function useAtalhosGlobais(acoes: AcoesAtalho) {
  const ref = useRef(acoes);
  ref.current = acoes;
  useEffect(() => {
    const aoTeclar = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ref.current.abrirBusca();
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (editavel(event.target) || document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
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
