import { useEffect, useRef } from "react";

/** Algo por cima da página que o próprio Esc deve fechar primeiro (janela, lista, menu). */
function camadaAberta(): boolean {
  return document.querySelector(
    // Só camadas que se fecham sozinhas com o Esc (Radix marcam data-state="open"). Uma lista de
    // resultados de busca que fica na página (ex.: produtos na venda) não segura o Esc.
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="listbox"][data-state="open"], [role="menu"][data-state="open"], [data-radix-popper-content-wrapper]',
  ) != null;
}

/**
 * Esc sai da página de formulário (Nova entrada, edição, verificação, ajuste, venda), como o
 * botão marcado com "(Esc)". Com uma janela, lista ou menu aberto, o Esc fecha só ela.
 * Quem passa `aoSair` decide se pergunta antes (formulário pela metade passa pelo aviso de saída).
 */
export function useEscSai(ativo: boolean, aoSair: () => void) {
  const ref = useRef(aoSair);
  ref.current = aoSair;
  useEffect(() => {
    if (!ativo) return;
    const aoTeclar = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      if (camadaAberta()) return;
      event.preventDefault();
      ref.current();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ativo]);
}
