import { useCallback, useEffect, useState } from "react";
import { CloudOff, LaptopMinimal, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BootSplashGate } from "@/components/BootSplashGate";
import { useBootUi } from "@/components/BootUi";
import { SaasLoginScreen } from "@/components/SaasLoginScreen";
import { SaasProfileSelector } from "@/components/SaasProfileSelector";
import { useSaasAuth } from "@/hooks/useSaasAuth";
import type { SaasAuthState } from "@/types/saas-auth";

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
  useEffect(() => {
    setProfileUnlocked(false);
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
    return <SaasProfileSelector session={state.session} onUnlocked={() => setProfileUnlocked(true)} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-slate-200" /><div><h1 className="text-xl font-semibold">Sessão SaaS autenticada</h1><p className="text-sm text-slate-400">{state.session.identity.email}</p></div></div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white" onClick={() => void lock()}><LockKeyhole className="mr-2 h-4 w-4" />Bloquear</Button>
            <Button variant="destructive" onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />Sair</Button>
          </div>
        </div>
        <div className="border-t border-white/10 pt-5">
          <Button variant="outline" className="border-rose-800 bg-rose-950/60 font-medium text-rose-100 hover:bg-rose-900 hover:text-white" onClick={confirmDeviceRemoval}>
            <LaptopMinimal className="mr-2 h-4 w-4" />Remover esta máquina
          </Button>
          <p className="mt-2 text-xs text-slate-500">Bloquear oculta o painel e preserva a sessão protegida no cofre local. Sair encerra apenas esta sessão; remover revoga a instalação no servidor e limpa seu acesso local.</p>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-white/5 p-4"><span className="text-slate-500">Empresa</span><p className="mt-1 break-all font-mono text-xs">{state.session.identity.companyId}</p></div>
          <div className="rounded-xl bg-white/5 p-4"><span className="text-slate-500">Perfil administrador</span><p className="mt-1 break-all font-mono text-xs">{state.session.identity.profileId}</p></div>
        </div>
        <p className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200">A identidade SaaS está pronta. Os módulos operacionais serão ligados ao adaptador remoto nos próximos tickets.</p>
      </section>
    </main>
  );
}
