import { CloudOff, Loader2, LockKeyhole, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaasLoginScreen } from "@/components/SaasLoginScreen";
import { useSaasAuth } from "@/hooks/useSaasAuth";

export function SaasApp() {
  const { state, retry, lock, signOut } = useSaasAuth();

  if (state.kind === "booting") {
    return (
      <main role="status" className="fixed inset-0 flex items-center justify-center bg-[#050608] text-slate-300">
        <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-cyan-400" /> Restaurando sessão segura...</div>
      </main>
    );
  }

  if (state.kind === "signed_out") return <SaasLoginScreen notice={state.message} />;
  if (state.kind === "expired") return <SaasLoginScreen initialEmail={state.email} notice={state.message} />;
  if (state.kind === "locked") {
    return <SaasLoginScreen notice="Aplicativo bloqueado. Entre novamente para continuar; sua sessão protegida foi preservada." />;
  }

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

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <section className="mx-auto max-w-3xl space-y-6 rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-emerald-400" /><div><h1 className="text-xl font-semibold">Sessão SaaS autenticada</h1><p className="text-sm text-slate-400">{state.session.identity.email}</p></div></div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void lock()}><LockKeyhole className="mr-2 h-4 w-4" />Bloquear</Button>
            <Button variant="destructive" onClick={() => void signOut()}><LogOut className="mr-2 h-4 w-4" />Sair</Button>
          </div>
        </div>
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-white/5 p-4"><span className="text-slate-500">Empresa</span><p className="mt-1 break-all font-mono text-xs">{state.session.identity.companyId}</p></div>
          <div className="rounded-xl bg-white/5 p-4"><span className="text-slate-500">Perfil administrador</span><p className="mt-1 break-all font-mono text-xs">{state.session.identity.profileId}</p></div>
        </div>
        <p className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">A identidade SaaS está pronta. Os módulos operacionais serão ligados ao adaptador remoto nos próximos tickets.</p>
      </section>
    </main>
  );
}
