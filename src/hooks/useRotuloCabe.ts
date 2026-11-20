import { useLayoutEffect, useRef, useState } from "react";

/**
 * Diz se um rótulo cabe inteiro no espaço do seu contêiner. Mede uma cópia invisível do texto
 * (que nunca é cortada) contra a largura livre do contêiner, de novo a cada mudança de tamanho:
 * janela menor, menu recolhido ou "Tamanho do texto" em Configurações › Geral.
 *
 * `folga`: espaço que o contêiner usa além do texto (ícone, espaçamento, bordas), em px.
 */
export function useRotuloCabe<C extends HTMLElement, M extends HTMLElement>(folga: number) {
  const conteinerRef = useRef<C>(null);
  const medidaRef = useRef<M>(null);
  const [cabe, setCabe] = useState(true);

  useLayoutEffect(() => {
    const conteiner = conteinerRef.current;
    const medida = medidaRef.current;
    if (!conteiner || !medida) return;
    const conferir = () => setCabe(medida.offsetWidth + folga <= conteiner.clientWidth);
    conferir();
    if (typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(conferir);
    observador.observe(conteiner);
    observador.observe(medida);
    return () => observador.disconnect();
  }, [folga]);

  return { conteinerRef, medidaRef, cabe };
}
