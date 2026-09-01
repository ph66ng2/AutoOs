import type { ReactNode } from "react";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";

/** Impede qualquer UI de balcão de montar antes do mesmo login/PIN do AutoOS. */
export function CounterSessionGate({ children }: { children: ReactNode }) {
  const { loading, status } = useSensitiveAccess();
  if (loading || !status?.active_profile_id || !status.unlocked) {
    return <div className="grid min-h-screen place-items-center bg-slate-950 text-lg text-white">Aguardando autenticação da sessão…</div>;
  }
  return <>{children}</>;
}
