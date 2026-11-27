import { motion, useReducedMotionConfig } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Confirmação de que algo chegou: o círculo cresce com mola e o "✓" é desenhado em seguida.
 * Decorativo (o texto ao lado diz o que aconteceu). Com movimento reduzido aparece pronto.
 */
function CheckAnimado({ className }: { className?: string }) {
  const reduzido = useReducedMotionConfig() ?? false;
  return (
    <motion.div
      aria-hidden="true"
      data-check-animado=""
      initial={reduzido ? false : { scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
      className={cn("flex h-16 w-16 items-center justify-center rounded-full bg-status-ok-bg text-status-ok", className)}
    >
      <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <motion.path
          d="M5 12.5l4.5 4.5L19 7.5"
          initial={reduzido ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.12, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </motion.div>
  );
}

export { CheckAnimado };
