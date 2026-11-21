import { useEffect, useState, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { animacoesReduzidasAqui } from "@/lib/preferencias-computador";

/** Faz as animações do `motion` seguirem "Animações reduzidas" de Configurações › Geral. */
export function MovimentoDoComputador({ children }: { children: ReactNode }) {
  const [reduzidas, setReduzidas] = useState(animacoesReduzidasAqui);
  useEffect(() => {
    const sincronizar = () => setReduzidas(animacoesReduzidasAqui());
    window.addEventListener("autoos:preferencias-computador", sincronizar);
    return () => window.removeEventListener("autoos:preferencias-computador", sincronizar);
  }, []);
  return <MotionConfig reducedMotion={reduzidas ? "always" : "user"}>{children}</MotionConfig>;
}
