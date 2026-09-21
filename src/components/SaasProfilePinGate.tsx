import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reauthenticateSaasIdentity } from "@/lib/saas-auth";
import { tauriSaasProfilePinStore } from "@/lib/saas-profile-pin-store";
import type { SaasOperationalProfile, SaasSession } from "@/types/saas-auth";

interface SaasProfilePinGateProps {
  profile: SaasOperationalProfile;
  session: SaasSession;
  onUnlocked: () => void;
  onBack: () => void;
}

const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export function SaasProfilePinGate({ profile, session, onUnlocked, onBack }: SaasProfilePinGateProps) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [password, setPassword] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void tauriSaasProfilePinStore.status(profile.id).then((status) => {
      if (alive) setConfigured(status.configured);
    }).catch((cause) => {
      if (alive) setError(cause instanceof Error ? cause.message : "Não foi possível consultar o PIN local.");
    });
    return () => { alive = false; };
  }, [profile.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pin.length !== 6) return setError("Informe os seis dígitos do PIN.");
    if ((!configured || recovering) && pin !== confirmation) return setError("A confirmação do PIN não confere.");
    if (recovering && !password) return setError("Confirme sua senha SaaS para trocar o PIN.");
    setBusy(true);
    setError(null);
    try {
      if (recovering) await reauthenticateSaasIdentity(session, session.identity.email, password);
      if (configured && !recovering) await tauriSaasProfilePinStore.unlock(profile.id, pin);
      else await tauriSaasProfilePinStore.configure(profile.id, pin);
      setPassword("");
      onUnlocked();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível validar o PIN local.");
    } finally {
      setBusy(false);
    }
  };

  const creatingPin = configured === false || recovering;
  return (
    <main className="fixed inset-0 grid place-items-center bg-slate-950 p-5 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-7 shadow-2xl">
        <div className="mb-6 flex items-start gap-3"><div className="rounded-xl bg-emerald-400/10 p-3 text-emerald-300"><ShieldCheck /></div><div><h1 className="font-semibold">{creatingPin ? "Crie seu PIN local" : "Desbloqueie o AutoOS"}</h1><p className="mt-1 text-sm text-slate-400">{profile.name} · {session.identity.email}</p></div></div>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          {recovering ? <div className="space-y-2"><Label htmlFor="saas-reauth-password">Senha da conta SaaS</Label><Input id="saas-reauth-password" autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></div> : null}
          <div className="space-y-2"><Label htmlFor="saas-profile-pin">PIN de seis dígitos</Label><Input id="saas-profile-pin" autoFocus type="password" inputMode="numeric" autoComplete="one-time-code" value={pin} onChange={(event) => setPin(onlyDigits(event.target.value))} className="h-12 text-center text-xl tracking-[0.45em]" /></div>
          {creatingPin ? <div className="space-y-2"><Label htmlFor="saas-profile-pin-confirmation">Confirmar PIN</Label><Input id="saas-profile-pin-confirmation" type="password" inputMode="numeric" value={confirmation} onChange={(event) => setConfirmation(onlyDigits(event.target.value))} className="h-12 text-center text-xl tracking-[0.45em]" /></div> : null}
          {error ? <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p> : null}
          <Button className="w-full" disabled={busy || configured === null} type="submit"><KeyRound className="mr-2 h-4 w-4" />{busy ? "Verificando…" : creatingPin ? "Salvar PIN e continuar" : "Entrar"}</Button>
        </form>
        {configured && !recovering ? <Button variant="link" className="mt-3 px-0 text-slate-300" onClick={() => { setError(null); setPin(""); setRecovering(true); }}>Esqueci meu PIN</Button> : null}
        <Button variant="link" className="mt-2 px-0 text-slate-400" onClick={onBack}>Trocar perfil</Button>
        <p className="mt-4 text-xs leading-relaxed text-slate-500">O PIN não é enviado ao Supabase, não substitui sua senha e não concede permissões cloud.</p>
      </section>
    </main>
  );
}
