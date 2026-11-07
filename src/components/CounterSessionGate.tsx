import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";

/** Impede qualquer UI de balcão de montar antes do mesmo login/PIN do AutoOS. */
export function CounterSessionGate({ children }: { children: ReactNode }) {
  const { loading, status, openProfileSelector } = useSensitiveAccess();
  const pinPromptedRef = useRef(false);
  const locked = Boolean(status && !status.unlocked);

  useEffect(() => {
    if (status?.unlocked) {
      pinPromptedRef.current = false;
      return;
    }
    if (loading || !status || pinPromptedRef.current) return;
    pinPromptedRef.current = true;
    void openProfileSelector();
  }, [loading, status, openProfileSelector]);

  if (loading || !status?.active_profile_id || !status.unlocked) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 px-6 text-lg text-white">
        <div className="space-y-4 text-center">
          <p>Aguardando autenticação da sessão…</p>
          {!loading && locked && (
            <Button type="button" onClick={() => void openProfileSelector()}>Desbloquear</Button>
          )}
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
