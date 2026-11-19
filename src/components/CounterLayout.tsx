import { createContext, Suspense, useCallback, useContext, useState } from "react";
import { Lock } from "lucide-react";
import { useNavigate, Outlet } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSensitiveAccess } from "@/hooks/useSensitiveAccess";
import { setAppMode, type AppMode } from "@/lib/app-mode";

interface CounterSessionValue { reset: () => void; resetKey: number; }
const CounterSessionContext = createContext<CounterSessionValue | null>(null);

export function useCounterSession() {
  const context = useContext(CounterSessionContext);
  if (!context) throw new Error("useCounterSession deve ser usado dentro de CounterLayout");
  return context;
}

/** "Quarta, 11 de novembro" no fuso de Salvador. */
function dataDeHoje(): string {
  const texto = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bahia" });
  const semFeira = texto.replace("-feira", "");
  return semFeira.charAt(0).toUpperCase() + semFeira.slice(1);
}

function iniciais(nome?: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes.length === 1 ? partes[0].slice(0, 2) : partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export function CounterLayout({ onChangeMode }: { onChangeMode: (mode: AppMode) => void }) {
  const navigate = useNavigate();
  const { status, lockSensitiveAccess, openProfileSelector } = useSensitiveAccess();
  const [resetKey, setResetKey] = useState(0);
  const reset = useCallback(() => {
    setResetKey((key) => key + 1);
    navigate("/balcao");
  }, [navigate]);

  function changeMode() {
    const next = window.confirm("Abrir o AutoOS Completo? Use o cabeçalho para voltar ao Modo Balcão.") ? "standard" : "counter";
    setAppMode(next);
    onChangeMode(next);
    navigate(next === "counter" ? "/balcao" : "/");
  }

  return (
    <CounterSessionContext.Provider value={{ reset, resetKey }}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-30 flex min-h-[72px] flex-wrap items-center gap-3 border-b bg-card px-4 py-3 lg:px-8">
          <button type="button" onClick={reset} aria-label="Início do balcão" className="flex min-h-12 items-center gap-3 rounded-xl pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-primary text-xs font-extrabold text-primary-foreground">OS</span>
            <span>
              <span className="block text-lg font-bold leading-tight">Balcão</span>
              <span className="block text-xs text-muted-foreground">{dataDeHoje()}</span>
            </span>
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" className="min-h-12 gap-2 rounded-full pl-2 pr-4 text-base" onClick={() => void openProfileSelector()}>
              <span aria-hidden="true" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">{iniciais(status?.active_profile_name)}</span>
              {status?.active_profile_name || "Perfil"}
            </Button>
            <Button variant="outline" className="min-h-12 text-base" onClick={changeMode}>Modo completo</Button>
            {status?.unlocked && <Button variant="outline" size="icon" className="h-12 w-12" aria-label="Bloquear acesso" onClick={() => void lockSensitiveAccess()}><Lock /></Button>}
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] p-4 lg:p-8">
          <Suspense fallback={<div role="status" aria-live="polite">Carregando página</div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </CounterSessionContext.Provider>
  );
}
