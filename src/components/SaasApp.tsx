import { useCallback, useEffect, useState } from "react";
import { CloudOff, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BootSplashGate } from "@/components/BootSplashGate";
import { useBootUi } from "@/components/BootUi";
import { SaasLoginScreen } from "@/components/SaasLoginScreen";
import { SaasProfileSelector } from "@/components/SaasProfileSelector";
import { SaasOperationalShell } from "@/components/SaasOperationalShell";
import { useSaasAuth } from "@/hooks/useSaasAuth";
import type { SaasAuthState, SaasOperationalProfile } from "@/types/saas-auth";

export function SaasApp() {
  const { state, retry, lock, signOut, removeThisDevice } = useSaasAuth();
  const { openingComplete, completeOpening } = useBootUi();
  const [bootProgress, setBootProgress] = useState(8);

  useEffect(() => {
    if (state.kind !== "booting") {
      setBootProgress(100);
      return;
    }

    setBootProgress(12);
    const timers = [
      window.setTimeout(() => setBootProgress((p) => Math.max(p, 28)), 180),
      window.setTimeout(() => setBootProgress((p) => Math.max(p, 52)), 420),
      window.setTimeout(() => setBootProgress((p) => Math.max(p, 78)), 780),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [state.kind]);

  const onSplashFinished = useCallback(() => {
    completeOpening();
  }, [completeOpening]);

  function confirmDeviceRemoval() {
    if (window.confirm("Remover esta máquina? O dispositivo será revogado no servidor e a sessão local será apagada. Esta ação exige novo login nesta instalação.")) {
      void removeThisDevice();
    }
  }

  // Primeiro boot do dia: stamp até o fim, depois login. Nos outros, login direto.
  if (!openingComplete) {
    return (
      <>
        <main className="fixed inset-0 bg-slate-950" aria-hidden="true" />
        <BootSplashGate
          loading={state.kind === "booting"}
          progress={bootProgress}
          onFinished={onSplashFinished}
        />
      </>
    );
  }

  return (
    <SaasAppBody
      state={state}
      retry={retry}
      lock={lock}
      signOut={signOut}
      confirmDeviceRemoval={confirmDeviceRemoval}
    />
  );
}

function SaasAppBody({
  state,
  retry,
  lock,
  signOut,
  confirmDeviceRemoval,
}: {
  state: SaasAuthState;
  retry: () => Promise<void>;
  lock: () => Promise<void>;
  signOut: () => Promise<void>;
  confirmDeviceRemoval: () => void;
}) {
  const [profileUnlocked, setProfileUnlocked] = useState(false);
  const [operationalProfile, setOperationalProfile] = useState<SaasOperationalProfile | null>(null);
  useEffect(() => {
    setProfileUnlocked(false);
    setOperationalProfile(null);
  }, [state.kind === "authenticated" ? state.session.identity.profileId : null]);
  if (state.kind === "booting") {
    return (
      <main role="status" className="fixed inset-0 flex items-center justify-center bg-slate-950 text-slate-300">
        Preparando sessão…
      </main>
    );
  }

  if (state.kind === "signed_out") return <SaasLoginScreen notice={state.message} />;
  if (state.kind === "expired") return <SaasLoginScreen initialEmail={state.email} notice={state.message} />;
  if (state.kind === "locked") return <SaasLoginScreen notice="Aplicativo bloqueado. O painel foi ocultado e sua sessão protegida permanece somente no cofre desta máquina." />;

  if (state.kind === "offline_recoverable") {
    return (
      <main className="fixed inset-0 flex items-center justify-center bg-slate-950 px-4 text-white">
        <section className="w-full max-w-lg space-y-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-7 text-center">
          <CloudOff className="mx-auto h-10 w-10 text-amber-300" />
          <div><h1 className="text-xl font-semibold">Autenticação temporariamente offline</h1><p className="mt-2 text-sm text-slate-300">{state.message}</p></div>
          <div className="flex justify-center gap-3">
            <Button onClick={() => void retry()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
            <Button variant="outline" onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />Sair neste dispositivo</Button>
          </div>
        </section>
      </main>
    );
  }

  if (!profileUnlocked) {
    return <SaasProfileSelector session={state.session} onUnlocked={(profile) => { setOperationalProfile(profile); setProfileUnlocked(true); }} />;
  }

  if (!operationalProfile) return <SaasProfileSelector session={state.session} onUnlocked={(profile) => { setOperationalProfile(profile); setProfileUnlocked(true); }} />;
  return <SaasOperationalShell
    session={state.session}
    profile={operationalProfile}
    onLock={() => { setProfileUnlocked(false); setOperationalProfile(null); void lock(); }}
    onSignOut={() => void signOut()}
    onRemoveDevice={confirmDeviceRemoval}
  />;
}
