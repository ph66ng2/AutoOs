import { useLayoutEffect, useRef, type RefObject } from "react";

import type { Destaque } from "@/lib/ao-vivo";
import { movimentoReduzido } from "@/lib/preferencias-computador";

/** Atributo que cada linha/cartão da lista leva com o seu id: `data-chave-ao-vivo={id}`. */
export const ATRIBUTO_CHAVE = "data-chave-ao-vivo";

const DURACAO_MS = 520;
// Sai rápido e assenta devagar, com um leve passo além (sensação de mola, sem biblioteca).
const CURVA = "cubic-bezier(0.22, 1.2, 0.36, 1)";

type Posicao = { x: number; y: number };

function posicoes(raiz: HTMLElement): Map<string, Posicao> {
  const mapa = new Map<string, Posicao>();
  raiz.querySelectorAll<HTMLElement>(`[${ATRIBUTO_CHAVE}]`).forEach((el) => {
    mapa.set(el.getAttribute(ATRIBUTO_CHAVE)!, { x: el.offsetLeft, y: el.offsetTop });
  });
  return mapa;
}

/**
 * Quando a atualização ao vivo traz um item **novo** (outra máquina registrou), as linhas que já
 * estavam deslizam para abrir espaço (em grade, também de lado) e a nova desce do alto até o lugar dela.
 * Troca de página, filtro ou busca não anima (só anima quando `destaques` traz um "novo").
 * Usa a Web Animations API só com `transform`/`opacity`; com movimento reduzido não faz nada.
 */
export function useDeslizeDaLista(
  raiz: RefObject<HTMLElement | null>,
  destaques: Map<number | string, Destaque> | undefined,
) {
  const anteriores = useRef<Map<string, Posicao>>(new Map());
  const ultimoDestaque = useRef<typeof destaques>(undefined);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const agora = posicoes(el);
    const antes = anteriores.current;
    anteriores.current = agora;

    if (!destaques || destaques === ultimoDestaque.current) return;
    ultimoDestaque.current = destaques;
    const novos = [...destaques].filter(([, tipo]) => tipo === "novo").map(([id]) => String(id));
    if (novos.length === 0 || antes.size === 0 || movimentoReduzido()) return;

    el.querySelectorAll<HTMLElement>(`[${ATRIBUTO_CHAVE}]`).forEach((linha) => {
      if (typeof linha.animate !== "function") return;
      const chave = linha.getAttribute(ATRIBUTO_CHAVE)!;
      if (novos.includes(chave) && !antes.has(chave)) {
        linha.animate(
          [
            { transform: `translateY(-${Math.max(linha.offsetHeight, 24)}px)`, opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          { duration: DURACAO_MS, easing: CURVA },
        );
        return;
      }
      const de = antes.get(chave);
      const para = agora.get(chave);
      if (!de || !para) return;
      const dx = de.x - para.x;
      const dy = de.y - para.y;
      if (dx !== 0 || dy !== 0) {
        linha.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: DURACAO_MS,
          easing: CURVA,
        });
      }
    });
  });
}
