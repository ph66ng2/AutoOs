import { useEffect, useRef } from "react";

export interface AcoesAtalho {
  abrirBusca: () => void;
  abrirAjuda: () => void;
  novaEntrada: () => void;
  novaVenda: () => void;
  /** Ctrl+L: tranca a sessão na hora (sair do balcão). */
  bloquear?: () => void;
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
 * Atalhos do app inteiro. Os que abrem algo usam uma tecla de apoio (Ctrl/Alt), então valem
 * até dentro de um campo sem atrapalhar a digitação; só a "/" é sozinha e por isso fica de fora
 * dos campos. Com uma janela modal aberta nenhum vale: trocar de tela por baixo de uma operação
 * aplicaria a operação no lugar errado. O convite do tour não conta como janela.
 */
export function useAtalhosGlobais(acoes: AcoesAtalho) {
  const ref = useRef(acoes);
  ref.current = acoes;
  useEffect(() => {
    const aoTeclar = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const ctrlL = (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.code === "KeyL";
      // Bloquear vale até com uma janela aberta: é para quem precisa sair do computador agora.
      if (ctrlL && ref.current.bloquear) {
        event.preventDefault();
        ref.current.bloquear();
        return;
      }
      const janelaAberta = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') != null;
      if (janelaAberta) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const executar = (acao: () => void) => { event.preventDefault(); acao(); };
      // Pelo código da tecla: com Alt, o Mac troca o caractere (Alt+N vira "˜").
      if (ctrl && !event.altKey && !event.shiftKey && event.code === "KeyK") return executar(ref.current.abrirBusca);
      if (ctrl && !event.altKey && (event.key === "/" || event.code === "Slash")) return executar(ref.current.abrirAjuda);
      if (event.altKey && !ctrl && !event.shiftKey && event.code === "KeyN") return executar(ref.current.novaEntrada);
      if (event.altKey && !ctrl && !event.shiftKey && event.code === "KeyV") return executar(ref.current.novaVenda);
      if (ctrl || event.altKey || event.shiftKey) return;
      if (event.key === "/" && !editavel(event.target)) {
        const caixa = caixaDeBuscaDaTela();
        if (!caixa) return;
        executar(() => { caixa.focus(); caixa.select(); });
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);
}
