import { createContext, useCallback, useContext, useState } from "react";
import { Home, LayoutPanelTop, Lock, LogOut, Repeat2, UserRound } from "lucide-react";
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
      <div className="min-h-screen bg-slate-100 text-slate-950">
        <header className="sticky top-0 z-30 flex min-h-20 flex-wrap items-center gap-3 border-b bg-slate-950 px-4 py-3 text-white shadow-lg lg:px-8">
          <Button variant="ghost" className="min-h-12 gap-2 text-base text-white hover:bg-white/10 hover:text-white" onClick={reset}><Home /> Início</Button>
          <Button variant="ghost" className="min-h-12 gap-2 text-base text-white hover:bg-white/10 hover:text-white" onClick={() => navigate("/balcao/painel")}><LayoutPanelTop /> Painel operacional</Button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="ghost" className="min-h-12 gap-2 text-base text-white hover:bg-white/10 hover:text-white" onClick={() => void openProfileSelector()}><UserRound /> {status?.active_profile_name || "Perfil"}</Button>
            <Button variant="ghost" className="min-h-12 gap-2 text-base text-white hover:bg-white/10 hover:text-white" onClick={reset}><LogOut /> Encerrar atendimento</Button>
            <Button variant="ghost" className="min-h-12 gap-2 text-base text-white hover:bg-white/10 hover:text-white" onClick={changeMode}><Repeat2 /> Trocar modo</Button>
            {status?.unlocked && <Button variant="ghost" size="icon" className="h-12 w-12 text-white hover:bg-white/10 hover:text-white" aria-label="Bloquear acesso" onClick={() => void lockSensitiveAccess()}><Lock /></Button>}
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] p-4 lg:p-8"><Outlet /></main>
      </div>
    </CounterSessionContext.Provider>
  );
}
