import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { animacoesReduzidasAqui } from "@/lib/preferencias-computador";

/**
 * Movimento reduzido para efeitos decididos no código (atrasos, sons, molas): vale a opção do
 * sistema operacional ou "Reduzir animações" de Configurações › Geral. O `MotionConfig` só cobre
 * as animações do `motion`, não o que lê `useReducedMotion()` direto.
 */
export function useMovimentoReduzido(): boolean {
  const doSistema = useReducedMotion();
  const [local, setLocal] = useState(animacoesReduzidasAqui);
  useEffect(() => {
    const sincronizar = () => setLocal(animacoesReduzidasAqui());
    window.addEventListener("autoos:preferencias-computador", sincronizar);
    return () => window.removeEventListener("autoos:preferencias-computador", sincronizar);
  }, []);
  return Boolean(doSistema) || local;
}
