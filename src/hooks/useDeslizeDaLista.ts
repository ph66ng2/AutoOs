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
  // As duas últimas medições: a lista nova costuma renderizar um passo antes do mapa de destaques
  // (useDestaquesAoVivo calcula depois que os itens chegam), então a posição "de antes" pode ser a penúltima.
  const ultima = useRef<Map<string, Posicao>>(new Map());
  const penultima = useRef<Map<string, Posicao>>(new Map());
  const ultimoDestaque = useRef<typeof destaques>(undefined);

  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const agora = posicoes(el);
    const medidaAnterior = ultima.current;
    const medidaDeAntesDaAnterior = penultima.current;
    penultima.current = medidaAnterior;
    ultima.current = agora;

    if (!destaques || destaques === ultimoDestaque.current) return;
    ultimoDestaque.current = destaques;
    const novos = [...destaques].filter(([, tipo]) => tipo === "novo").map(([id]) => String(id));
    if (novos.length === 0 || movimentoReduzido()) return;
    // Se o item novo já estava na medição anterior, a lista chegou um render antes dos destaques:
    // a posição de antes da chegada é a medição anterior a essa.
    const jaChegou = novos.some((id) => medidaAnterior.has(id));
    const antes = jaChegou ? medidaDeAntesDaAnterior : medidaAnterior;
    if (antes.size === 0) return;

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
