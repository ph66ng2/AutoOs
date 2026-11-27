import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

/*
 * Números que mudam sozinhos na tela (atualização ao vivo, avisos novos).
 * A animação só marca a mudança: o valor certo aparece na hora para leitor de tela,
 * e com movimento reduzido o MotionConfig do app (MovimentoDoComputador) corta o movimento.
 */

const MOLA = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;

/** Guarda o valor anterior e diz se o atual subiu, desceu ou ficou igual. */
function useDirecao(valor: number) {
  const anterior = useRef(valor);
  const [direcao, setDirecao] = useState<-1 | 0 | 1>(0);
  useEffect(() => {
    if (valor !== anterior.current) setDirecao(valor > anterior.current ? 1 : -1);
    anterior.current = valor;
  }, [valor]);
  return direcao;
}

/**
 * Número que rola: o antigo sai pelo alto e o novo entra por baixo quando o valor sobe
 * (ao contrário quando desce). No primeiro render não anima.
 */
function NumeroRolante({ valor, className }: { valor: number; className?: string }) {
  const direcao = useDirecao(valor);
  return (
    <span className={cn("relative inline-flex overflow-hidden tabular-nums", className)}>
      <AnimatePresence initial={false} mode="popLayout" custom={direcao}>
        <motion.span
          key={valor}
          custom={direcao}
          variants={{
            entra: (d: number) => ({ y: d >= 0 ? "100%" : "-100%", opacity: 0 }),
            fica: { y: "0%", opacity: 1 },
            sai: (d: number) => ({ y: d >= 0 ? "-100%" : "100%", opacity: 0 }),
          }}
          initial="entra"
          animate="fica"
          exit="sai"
          transition={MOLA}
          className="inline-block"
        >
          {valor}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * Selo de contagem que dá um pequeno salto quando o número **sobe** (aviso novo).
 * Quando desce (itens lidos) não chama atenção.
 */
function SeloQueSalta({ valor, className, children }: { valor: number; className?: string; children: ReactNode }) {
  const anterior = useRef(valor);
  const [pulso, setPulso] = useState(0);
  useEffect(() => {
    if (valor > anterior.current) setPulso((p) => p + 1);
    anterior.current = valor;
  }, [valor]);
  return (
    <motion.span
      key={pulso}
      data-pulso={pulso}
      initial={pulso > 0 ? { scale: 1.35 } : false}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 600, damping: 14 }}
      className={className}
    >
      {children}
    </motion.span>
  );
}

export { NumeroRolante, SeloQueSalta };
